import * as vscode from 'vscode';
import type { NotificationSetting } from '../domain/notifications';
import type { PermissionMode } from '../domain/task';
import { DEFAULT_PRESETS, normalizePresets, type Preset } from '../domain/presets';

export interface Settings {
  claudePath: string | undefined;
  defaultModel: string | undefined;
  defaultPermissionMode: PermissionMode;
  notifications: NotificationSetting;
  /** タスク画面の本文の最大の幅（em）。0 なら画面いっぱい */
  taskViewWidth: number;
  /** 新しいタスクで worktree を使うかの既定 */
  useWorktree: boolean;
  /** worktree のブランチ名の接頭辞 */
  worktreeBranchPrefix: string;
  /** ツールの呼び出しを最初から開いて見せるか */
  toolCallsExpanded: boolean;
  /** 軽いモデルで短いタイトルを付けるか */
  autoTitle: boolean;
  /** タイトル付けに使うモデル */
  titleModel: string;
  /** 指示のプリセット。/名前 で本文に置き換わる */
  presets: Preset[];
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
    taskViewWidth: Math.max(0, config.get<number>('taskViewWidth', 72)),
    useWorktree: config.get<boolean>('useWorktree', false),
    worktreeBranchPrefix: config.get<string>('worktreeBranchPrefix', 'foreman/'),
    toolCallsExpanded: config.get<string>('toolCalls', 'collapsed') === 'expanded',
    autoTitle: config.get<boolean>('autoTitle', true),
    titleModel: text('titleModel') ?? 'haiku',
    presets: normalizePresets(config.get<unknown[]>('presets', [...DEFAULT_PRESETS])),
  };
}
