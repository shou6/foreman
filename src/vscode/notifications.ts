import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import {
  notificationFor,
  type NotificationKind,
  type NotificationSetting,
} from '../domain/notifications';
import type { Task } from '../domain/task';

/** 入力待ちと完了・失敗を VS Code の通知で知らせる。通知からタスク画面を開ける */
export class Notifications implements vscode.Disposable {
  private readonly previous = new Map<string, Task['status']>();
  private readonly subscriptions: (() => void)[] = [];

  constructor(
    service: TaskService,
    private readonly open: (taskId: string) => void,
    private readonly setting: () => NotificationSetting
  ) {
    this.subscriptions.push(
      service.onDidChange((task) => {
        const kind = notificationFor(this.previous.get(task.id), task.status, this.setting());
        this.previous.set(task.id, task.status);
        if (kind !== undefined) {
          void this.show(task, kind);
        }
      }),
      service.onDidDelete((taskId) => this.previous.delete(taskId))
    );
  }

  private async show(task: Task, kind: NotificationKind): Promise<void> {
    const openLabel = vscode.l10n.t('Open');
    let choice: string | undefined;
    switch (kind) {
      case 'waiting':
        choice = await vscode.window.showInformationMessage(
          vscode.l10n.t('Task "{0}" needs your input.', task.title),
          openLabel
        );
        break;
      case 'done':
        choice = await vscode.window.showInformationMessage(
          vscode.l10n.t('Task "{0}" finished.', task.title),
          openLabel
        );
        break;
      case 'review':
        choice = await vscode.window.showInformationMessage(
          vscode.l10n.t('Task "{0}" has changes to review.', task.title),
          openLabel
        );
        break;
      case 'failed': {
        const result = task.turns[task.turns.length - 1]?.result;
        const reason = result !== undefined && !result.ok ? result.reason : '';
        choice = await vscode.window.showErrorMessage(
          vscode.l10n.t('Task "{0}" failed: {1}', task.title, reason),
          openLabel
        );
        break;
      }
    }
    if (choice === openLabel) {
      this.open(task.id);
    }
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
  }
}
