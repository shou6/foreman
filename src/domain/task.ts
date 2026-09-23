import { titleFromPrompt } from './taskTitle';

/** タスクの状態（要件定義書 6.1） */
export type TaskStatus = 'running' | 'waiting' | 'done' | 'failed' | 'interrupted';

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
  | 'resume'; // 中断したタスクを再開した

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
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  sessionId?: string;
  parentTaskId?: string;
  cwd: string;
  model?: string;
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
  running: {
    'permission-requested': 'waiting',
    'question-asked': 'waiting',
    'turn-completed': 'done',
    error: 'failed',
    stop: 'interrupted',
    'host-exit': 'interrupted',
  },
  waiting: {
    answered: 'running',
    error: 'failed',
    stop: 'interrupted',
    'host-exit': 'interrupted',
  },
  done: { prompt: 'running' },
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
  createdAt: string;
  title?: string;
  model?: string;
  permissionMode?: PermissionMode;
  parentTaskId?: string;
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
    status: 'running',
    parentTaskId: input.parentTaskId,
    cwd: input.cwd,
    model: input.model,
    permissionMode: input.permissionMode ?? 'default',
    alwaysAllowed: [],
    turns: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}
