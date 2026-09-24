import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import { canUnapprove, isTurnOpen } from '../domain/task';

interface MoreAction extends vscode.QuickPickItem {
  command: string;
}

/**
 * タスク画面の見出しの「…」。名前の変更・書き出し・切り出し・削除を選び、
 * 左サイドバーの右クリックと同じコマンドを実行する
 */
export async function moreActions(service: TaskService, taskId: string): Promise<void> {
  const task = await service.load(taskId);
  if (task === undefined) {
    return;
  }
  const items: MoreAction[] = [
    { label: `$(edit) ${vscode.l10n.t('Rename')}`, command: 'foreman.renameTask' },
    { label: `$(export) ${vscode.l10n.t('Export as Markdown')}`, command: 'foreman.exportTask' },
  ];
  // 左サイドバーの右クリックと同じく、動いている間と下書きは切り出せない
  if (!isTurnOpen(task) && task.status !== 'draft') {
    items.push({ label: `$(git-branch) ${vscode.l10n.t('Fork')}`, command: 'foreman.forkTask' });
  }
  if (canUnapprove(task)) {
    items.push({
      label: `$(discard) ${vscode.l10n.t('Undo approval')}`,
      command: 'foreman.unapproveTask',
    });
  }
  items.push({ label: `$(trash) ${vscode.l10n.t('Delete')}`, command: 'foreman.deleteTask' });
  const picked = await vscode.window.showQuickPick(items, { placeHolder: task.title });
  if (picked !== undefined) {
    await vscode.commands.executeCommand(picked.command, taskId);
  }
}
