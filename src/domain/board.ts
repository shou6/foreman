import { elapsedMinutes } from './sidebar';
import { isTurnOpen, type Task, type TaskStatus } from './task';

/** ボードの列（要件定義書 5.1）。失敗と中断は「実行中」の列にバッジで出す */
export type BoardColumnKey = 'draft' | 'running' | 'waiting' | 'review' | 'done';

export const BOARD_COLUMNS: readonly BoardColumnKey[] = [
  'draft',
  'running',
  'waiting',
  'review',
  'done',
];

export interface BoardCard {
  id: string;
  title: string;
  status: TaskStatus;
  /** Claude が動いている（最後のターンが終わっていない） */
  turnOpen: boolean;
  /** 失敗・中断のバッジ */
  badge?: 'failed' | 'interrupted';
  model?: string;
  /** worktree のブランチ */
  branch?: string;
  /** 最後のターンの変更ファイル数 */
  changes: number;
  /** 全ターンの追加・削除の行数 */
  added?: number;
  removed?: number;
  /** 実行中なら、今のターンの開始からの分数 */
  elapsedMinutes?: number;
  /** 下書きの指示、または最後の指示 */
  prompt?: string;
  updatedAt: string;
}

export interface BoardColumn {
  key: BoardColumnKey;
  cards: BoardCard[];
}

export function columnOf(status: TaskStatus): BoardColumnKey {
  switch (status) {
    case 'failed':
    case 'interrupted':
      return 'running';
    default:
      return status;
  }
}

/** 列をまたぐ移動で行う操作。許さない移動は undefined */
export function moveAllowed(
  from: BoardColumnKey,
  to: BoardColumnKey,
  turnOpen = false
): 'start' | 'approve' | undefined {
  if (from === 'draft' && to === 'running') {
    return 'start';
  }
  if ((from === 'review' || (from === 'waiting' && !turnOpen)) && to === 'done') {
    return 'approve';
  }
  return undefined;
}

export function cardOf(task: Task, now?: string): BoardCard {
  const last = task.turns[task.turns.length - 1];
  const totals = lineTotals(task);
  return {
    added: totals.added,
    removed: totals.removed,
    elapsedMinutes:
      task.status === 'running' && now !== undefined
        ? elapsedMinutes(last?.startedAt, now)
        : undefined,
    id: task.id,
    title: task.title,
    status: task.status,
    turnOpen: isTurnOpen(task),
    badge: task.status === 'failed' || task.status === 'interrupted' ? task.status : undefined,
    model: task.activeModel ?? task.model,
    branch: task.worktree?.branch,
    changes: last?.changes.length ?? 0,
    prompt: task.draftPrompt ?? last?.prompt,
    updatedAt: task.updatedAt,
  };
}

/** タスクを列に振り分ける。列の中は order の小さい順、order が無いものは更新の新しい順 */
export function boardOf(tasks: readonly Task[], now?: string): BoardColumn[] {
  return BOARD_COLUMNS.map((key) => ({
    key,
    cards: tasks
      .filter((task) => columnOf(task.status) === key)
      .sort(compareForBoard)
      .map((task) => cardOf(task, now)),
  }));
}

/** 全ターンの追加・削除の行数の合計。数えられない変更（変更前が不明）は除く */
export function lineTotals(task: Pick<Task, 'turns'>): { added?: number; removed?: number } {
  let added: number | undefined;
  let removed: number | undefined;
  for (const turn of task.turns) {
    for (const change of turn.changes) {
      if (change.added !== undefined) {
        added = (added ?? 0) + change.added;
      }
      if (change.removed !== undefined) {
        removed = (removed ?? 0) + change.removed;
      }
    }
  }
  return { added, removed };
}

/** ボードと一覧の並び。order の小さい順、order が無いものは更新の新しい順 */
export function compareForBoard(a: Task, b: Task): number {
  if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
    return a.order - b.order;
  }
  if (a.order !== undefined && b.order === undefined) {
    return -1;
  }
  if (a.order === undefined && b.order !== undefined) {
    return 1;
  }
  return b.updatedAt.localeCompare(a.updatedAt);
}
