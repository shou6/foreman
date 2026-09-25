import type { PermissionRequest } from './events';
import { questionsOf } from './question';
import type { TaskStatus } from './task';

/**
 * 画面に出す状態の呼び名。サイドバー・タスク画面の見出し・右サイドバー・ボードで同じものを使う。
 * waiting はユーザーに何を待っているかで、承認待ち・質問あり・返答済みに分ける
 */
export type StatusKind =
  | 'draft'
  | 'running'
  | 'approval'
  | 'question'
  | 'replied'
  | 'review'
  | 'done'
  | 'failed'
  | 'interrupted';

/** 答えていない要求の種類 */
export type PendingKind = 'approval' | 'question';

export function statusKindOf(
  status: TaskStatus,
  turnOpen: boolean,
  pending: PendingKind | undefined
): StatusKind {
  if (status !== 'waiting') {
    return status;
  }
  if (pending !== undefined) {
    return pending;
  }
  // ターンが開いたままなら、承認か質問を待っている
  return turnOpen ? 'approval' : 'replied';
}

export function pendingKindOf(request: PermissionRequest): PendingKind {
  return questionsOf(request) !== undefined ? 'question' : 'approval';
}

/** ボードのカードの主な操作。状態ごとに 1 つだけ */
export type PrimaryAction = 'start' | 'stop' | 'open' | 'markDone' | 'approve';

export function primaryActionOf(kind: StatusKind): PrimaryAction | undefined {
  switch (kind) {
    case 'draft':
      return 'start';
    case 'running':
      return 'stop';
    case 'approval':
    case 'question':
    case 'failed':
    case 'interrupted':
      return 'open';
    case 'replied':
      return 'markDone';
    case 'review':
      return 'approve';
    case 'done':
      return undefined;
  }
}

/** 承認カードの問いかけの種類 */
export type ApprovalKind = 'command' | 'edit' | 'web' | 'plan' | 'other';

export function approvalKindOf(toolName: string): ApprovalKind {
  switch (toolName) {
    case 'Bash':
      return 'command';
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'edit';
    case 'WebFetch':
    case 'WebSearch':
      return 'web';
    case 'ExitPlanMode':
      return 'plan';
    default:
      return 'other';
  }
}
