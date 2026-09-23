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
    private readonly setting: () => NotificationSetting,
    private readonly channel: () => 'vscode' | 'desktop' | 'both' = () => 'vscode',
    private readonly desktop?: (notification: DesktopNotification) => Promise<void>
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
    const channel = this.channel();
    if (channel !== 'vscode' && this.desktop !== undefined) {
      void this.desktop(desktopNotificationOf(task, kind)).catch((error: unknown) => {
        void vscode.window.showWarningMessage(
          vscode.l10n.t(
            'Desktop notification failed: {0}',
            error instanceof Error ? error.message : String(error)
          )
        );
      });
    }
    if (channel === 'desktop') {
      return;
    }
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

export interface DesktopNotification {
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

/** デスクトップ通知の文言。VS Code の通知と同じ内容 */
export function desktopNotificationOf(task: Task, kind: NotificationKind): DesktopNotification {
  switch (kind) {
    case 'waiting':
      return {
        title: vscode.l10n.t('Waiting for input'),
        message: vscode.l10n.t('Task "{0}" needs your input.', task.title),
        level: 'info',
      };
    case 'review':
      return {
        title: vscode.l10n.t('Review'),
        message: vscode.l10n.t('Task "{0}" has changes to review.', task.title),
        level: 'warning',
      };
    case 'done':
      return {
        title: vscode.l10n.t('Done'),
        message: vscode.l10n.t('Task "{0}" finished.', task.title),
        level: 'success',
      };
    case 'failed': {
      const result = task.turns[task.turns.length - 1]?.result;
      const reason = result !== undefined && !result.ok ? result.reason : '';
      return {
        title: vscode.l10n.t('Failed'),
        message: vscode.l10n.t('Task "{0}" failed: {1}', task.title, reason),
        level: 'error',
      };
    }
  }
}
