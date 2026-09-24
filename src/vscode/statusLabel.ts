import * as vscode from 'vscode';
import type { PermissionRequest } from '../domain/events';
import { pendingKindOf, type PendingKind, type StatusKind } from '../domain/status';
import type { TaskStatus } from '../domain/task';

/** 状態の表示名 */
export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'draft':
      return vscode.l10n.t('Draft');
    case 'review':
      return vscode.l10n.t('Review');
    case 'running':
      return vscode.l10n.t('Running');
    case 'waiting':
      return vscode.l10n.t('Waiting for input');
    case 'done':
      return vscode.l10n.t('Done');
    case 'failed':
      return vscode.l10n.t('Failed');
    case 'interrupted':
      return vscode.l10n.t('Interrupted');
  }
}

/** 状態の呼び名の表示名（サイドバー・見出し・右サイドバー・ボードで共通） */
export function statusKindLabels(): Record<StatusKind, string> {
  return {
    draft: statusLabel('draft'),
    running: statusLabel('running'),
    approval: vscode.l10n.t('Needs approval'),
    question: vscode.l10n.t('Question'),
    replied: vscode.l10n.t('Replied'),
    review: statusLabel('review'),
    done: statusLabel('done'),
    failed: statusLabel('failed'),
    interrupted: statusLabel('interrupted'),
  };
}

/** 左サイドバーのグループとボードの列の名前。waiting は「あなたの番」 */
export function yourTurnLabel(): string {
  return vscode.l10n.t('Your turn');
}

/** 状態を持つタスクの、答えていない要求の種類（ID → 種類） */
export function pendingKinds(
  tasks: readonly { id: string }[],
  pending: (taskId: string) => PermissionRequest | undefined
): Map<string, PendingKind> {
  const kinds = new Map<string, PendingKind>();
  for (const task of tasks) {
    const request = pending(task.id);
    if (request !== undefined) {
      kinds.set(task.id, pendingKindOf(request));
    }
  }
  return kinds;
}
