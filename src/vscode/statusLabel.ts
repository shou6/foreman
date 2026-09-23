import * as vscode from 'vscode';
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
