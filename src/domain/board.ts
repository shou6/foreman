import type { Task, TaskStatus } from './task';

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
  /** 失敗・中断のバッジ */
  badge?: 'failed' | 'interrupted';
  model?: string;
  /** worktree のブランチ */
  branch?: string;
  /** 最後のターンの変更ファイル数 */
  changes: number;
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
  to: BoardColumnKey
): 'start' | 'approve' | undefined {
  if (from === 'draft' && to === 'running') {
    return 'start';
  }
  if (from === 'review' && to === 'done') {
    return 'approve';
  }
  return undefined;
}

export function cardOf(task: Task): BoardCard {
  const last = task.turns[task.turns.length - 1];
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    badge: task.status === 'failed' || task.status === 'interrupted' ? task.status : undefined,
    model: task.activeModel ?? task.model,
    branch: task.worktree?.branch,
    changes: last?.changes.length ?? 0,
    prompt: task.draftPrompt ?? last?.prompt,
    updatedAt: task.updatedAt,
  };
}

/** タスクを列に振り分ける。列の中は order の小さい順、order が無いものは更新の新しい順 */
export function boardOf(tasks: readonly Task[]): BoardColumn[] {
  return BOARD_COLUMNS.map((key) => ({
    key,
    cards: tasks
      .filter((task) => columnOf(task.status) === key)
      .sort(compare)
      .map(cardOf),
  }));
}

function compare(a: Task, b: Task): number {
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
