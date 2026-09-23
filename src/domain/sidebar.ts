import { compareForBoard } from './board';
import { isTurnOpen, type Task, type TaskStatus } from './task';

/** 左サイドバーのグループ。手が要るものを上にする */
export type SidebarGroupKey = 'waiting' | 'running' | 'review' | 'draft' | 'done';

export const SIDEBAR_GROUPS: readonly SidebarGroupKey[] = [
  'waiting',
  'running',
  'review',
  'draft',
  'done',
];

/** 一覧の右端に出すバッジ */
export type SidebarBadge =
  /** 承認や質問に答えていない */
  | { kind: 'approval' }
  /** Claude が返答を終え、次の指示を待っている */
  | { kind: 'replied' }
  /** 実行中。開始からの分数 */
  | { kind: 'elapsed'; minutes: number }
  /** レビュー待ち。最後のターンの変更ファイル数 */
  | { kind: 'review'; files: number }
  | { kind: 'failed' }
  | { kind: 'interrupted' }
  | { kind: 'done' }
  | { kind: 'draft' };

export interface SidebarItem {
  id: string;
  title: string;
  status: TaskStatus;
  turnOpen: boolean;
  worktree: boolean;
  /** worktree のブランチ。無ければ undefined */
  branch?: string;
  /** 全ターンで触ったファイルの数（同じファイルは 1 つ） */
  files: number;
  badge: SidebarBadge;
}

export interface SidebarGroup {
  key: SidebarGroupKey;
  items: SidebarItem[];
}

export interface SidebarInput {
  /** 今の時刻（ISO）。経過時間の計算に使う */
  now: string;
  /** 承認や質問に答えていないタスクの ID */
  pendingApproval: ReadonlySet<string>;
}

export function groupOf(status: TaskStatus): SidebarGroupKey {
  switch (status) {
    case 'failed':
    case 'interrupted':
      return 'running';
    default:
      return status;
  }
}

/** 開始からの分数（切り捨て）。開始が無ければ undefined */
export function elapsedMinutes(startedAt: string | undefined, now: string): number | undefined {
  if (startedAt === undefined) {
    return undefined;
  }
  const ms = Date.parse(now) - Date.parse(startedAt);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60000)) : undefined;
}

export function badgeOf(task: Task, input: SidebarInput): SidebarBadge {
  const last = task.turns[task.turns.length - 1];
  switch (task.status) {
    case 'waiting':
      return input.pendingApproval.has(task.id) || isTurnOpen(task)
        ? { kind: 'approval' }
        : { kind: 'replied' };
    case 'running':
      return { kind: 'elapsed', minutes: elapsedMinutes(last?.startedAt, input.now) ?? 0 };
    case 'review':
      return { kind: 'review', files: last?.changes.length ?? 0 };
    case 'failed':
    case 'interrupted':
    case 'done':
    case 'draft':
      return { kind: task.status };
  }
}

export function itemOf(task: Task, input: SidebarInput): SidebarItem {
  const files = new Set<string>();
  for (const turn of task.turns) {
    for (const change of turn.changes) {
      files.add(change.path);
    }
  }
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    turnOpen: isTurnOpen(task),
    worktree: task.worktree !== undefined,
    branch: task.worktree?.branch,
    files: files.size,
    badge: badgeOf(task, input),
  };
}

/** タスクをグループに振り分ける。空のグループは出さない */
export function sidebarOf(tasks: readonly Task[], input: SidebarInput): SidebarGroup[] {
  return SIDEBAR_GROUPS.flatMap((key) => {
    const items = tasks
      .filter((task) => groupOf(task.status) === key)
      .sort(compareForBoard)
      .map((task) => itemOf(task, input));
    return items.length === 0 ? [] : [{ key, items }];
  });
}
