import * as vscode from 'vscode';
import type { NotificationSetting } from '../domain/notifications';
import type { PermissionMode } from '../domain/task';

export interface Settings {
  claudePath: string | undefined;
  defaultModel: string | undefined;
  defaultPermissionMode: PermissionMode;
  notifications: NotificationSetting;
}

/** 設定 foreman.* を読む。空文字は未設定として扱う */
export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('foreman');
  const text = (key: string): string | undefined => {
    const value = config.get<string>(key, '').trim();
    return value === '' ? undefined : value;
  };
  const mode = config.get<string>('defaultPermissionMode', 'default');
  const notifications = config.get<string>('notifications', 'all');
  return {
    claudePath: text('claudePath'),
    defaultModel: text('defaultModel'),
    defaultPermissionMode: mode === 'acceptEdits' ? 'acceptEdits' : 'default',
    notifications: notifications === 'waiting' || notifications === 'none' ? notifications : 'all',
  };
}
