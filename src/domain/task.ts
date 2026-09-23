import { titleFromPrompt } from './taskTitle';

/**
 * タスクの状態（要件定義書 6.1、5.1 のボードの列）。
 * draft は未開始。waiting は承認・質問・次の指示のいずれかをユーザーに待っている。
 * review は変更を伴うターンが終わって確認待ち。done はユーザーが承認（完了に）したもの。
 * Claude がターンを終えただけでは完了にしない
 */
export type TaskStatus =
  'draft' | 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'interrupted';

/** 状態を変えるイベント（実装計画書 4.1 の表） */
export type TaskEvent =
  | 'permission-requested' // ツールの承認をユーザーに求めた
  | 'question-asked' // Claude がユーザーに質問した
  | 'answered' // ユーザーが承認または質問に答えた
  | 'turn-completed' // ターンが正常に終わった
  | 'error' // ターンがエラーで終わった
  | 'stop' // ユーザーが止めた
  | 'host-exit' // VS Code の終了やプロセスの異常終了で途中で終わった
  | 'prompt' // 追加の指示を送った
  | 'resume' // 中断したタスクを再開した
  | 'start' // 下書きを開始した
  | 'changes-recorded' // 終わったターンに変更が記録された
  | 'approve'; // ユーザーが変更を確認した

export type PermissionMode = 'default' | 'acceptEdits';

/** 「このタスクでは常に許可」で SDK に返した内容。中身は解釈せず、そのまま保存する */
export type PermissionRule = Record<string, unknown>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  contextWindow: number;
}

export type TurnResult = { ok: true; usage?: Usage } | { ok: false; reason: string };

export interface FileChange {
  /** cwd からの相対パス */
  path: string;
  kind: 'created' | 'modified' | 'deleted';
  /** スナップショットのハッシュ。変更前が不明なら undefined */
  before?: string;
  after?: string;
  source: 'edit-tool' | 'watcher';
  reverted: boolean;
  /** 追加・削除の行数。変更前が不明なら undefined */
  added?: number;
  removed?: number;
}

export interface Turn {
  index: number;
  prompt: string;
  attachments: string[];
  startedAt: string;
  endedAt?: string;
  result?: TurnResult;
  changes: FileChange[];
  /** このターンの最後の assistant メッセージの uuid。チェックポイントの起点 */
  lastMessageUuid?: string;
}

/** タスクが使う git worktree（Phase 2）。無ければ作業ディレクトリでそのまま動く */
export interface Worktree {
  /** メインの作業ツリー（マージ先） */
  repo: string;
  /** worktree のフォルダ */
  path: string;
  branch: string;
  /** 切った元のブランチ */
  base: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  sessionId?: string;
  parentTaskId?: string;
  cwd: string;
  worktree?: Worktree;
  /** 会話を戻した後、次の再開でこのメッセージから分岐する。使ったら消す */
  resumeAt?: string;
  /** 下書きの指示。開始で最初のターンになり、消える */
  draftPrompt?: string;
  /** ボードでの並び。小さいほど上 */
  order?: number;
  model?: string;
  /** SDK の init が返した、実際に動いているモデル */
  activeModel?: string;
  permissionMode: PermissionMode;
  alwaysAllowed: PermissionRule[];
  turns: Turn[];
  createdAt: string;
  updatedAt: string;
}

/** 許されない状態遷移 */
export class TaskStateError extends Error {
  constructor(
    readonly status: TaskStatus,
    readonly event: TaskEvent
  ) {
    super(`Task in status "${status}" cannot accept event "${event}"`);
    this.name = 'TaskStateError';
  }
}

const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskEvent, TaskStatus>>> = {
  draft: { start: 'running' },
  review: { prompt: 'running', approve: 'done' },
  running: {
    'permission-requested': 'waiting',
    'question-asked': 'waiting',
    'turn-completed': 'waiting',
    error: 'failed',
    stop: 'interrupted',
    'host-exit': 'interrupted',
  },
  waiting: {
    answered: 'running',
    prompt: 'running',
    approve: 'done',
    'changes-recorded': 'review',
    error: 'failed',
    stop: 'interrupted',
    'host-exit': 'interrupted',
  },
  done: { prompt: 'running', 'changes-recorded': 'review' },
  failed: { prompt: 'running' },
  interrupted: { prompt: 'running', resume: 'running' },
};

/** 状態にイベントを当てて次の状態を返す。許されない組み合わせは TaskStateError */
export function transition(status: TaskStatus, event: TaskEvent): TaskStatus {
  const next = TRANSITIONS[status][event];
  if (next === undefined) {
    throw new TaskStateError(status, event);
  }
  return next;
}

export interface CreateTaskInput {
  id: string;
  prompt: string;
  cwd: string;
  worktree?: Worktree;
  createdAt: string;
  title?: string;
  model?: string;
  /** SDK の init が返した、実際に動いているモデル */
  activeModel?: string;
  permissionMode?: PermissionMode;
  parentTaskId?: string;
  /** true なら下書き（開始しない）として作る */
  draft?: boolean;
}

/** 新しいタスクを作る。セッションの起動は呼ぶ側が行うので、状態は最初から「実行中」 */
export function createTask(input: CreateTaskInput): Task {
  const title = input.title ?? titleFromPrompt(input.prompt);
  if (title === undefined) {
    throw new Error('prompt must not be empty');
  }
  return {
    id: input.id,
    title,
    status: input.draft === true ? 'draft' : 'running',
    draftPrompt: input.draft === true ? input.prompt : undefined,
    parentTaskId: input.parentTaskId,
    cwd: input.worktree?.path ?? input.cwd,
    worktree: input.worktree,
    model: input.model,
    permissionMode: input.permissionMode ?? 'default',
    alwaysAllowed: [],
    turns: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

/**
 * Claude がまだ動いている（最後のターンが終わっていない）。
 * waiting でもターンが終わっていれば、次の指示を待っているだけで動いてはいない
 */
export function isTurnOpen(task: Pick<Task, 'status' | 'turns'>): boolean {
  if (task.status !== 'running' && task.status !== 'waiting') {
    return false;
  }
  const last = task.turns[task.turns.length - 1];
  return last === undefined || last.endedAt === undefined;
}

/**
 * worktree を元のブランチへマージできるか。
 * 承認済み（完了）で、戻していない変更が残っている時だけ。計画だけで終わった worktree や
 * 未承認の変更はマージの対象にしない
 */
export function canMerge(task: Pick<Task, 'status' | 'turns' | 'worktree'>): boolean {
  return (
    task.worktree !== undefined &&
    task.status === 'done' &&
    task.turns.some((turn) => turn.changes.some((change) => !change.reverted))
  );
}
