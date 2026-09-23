import * as vscode from 'vscode';
import type { SettingSource } from '../ports/agentRunner';
import type { NotificationSetting } from '../domain/notifications';
import type { PermissionMode } from '../domain/task';

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
  /** 通知の出し方。desktop は Local Notifier 拡張機能の inbox に書く */
  notificationChannel: 'vscode' | 'desktop' | 'both';
  /** Claude Code の設定の読み込み元。空なら Claude Code の既定 */
  settingSources: SettingSource[] | undefined;
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
    titleModel: text('titleModel') ?? 'claude-haiku-4-5',
    notificationChannel: channelOf(config.get<string>('notificationChannel', 'both')),
    settingSources: sourcesOf(config.get<string[]>('settingSources', ['user', 'project', 'local'])),
  };
}

function channelOf(value: string): Settings['notificationChannel'] {
  return value === 'desktop' || value === 'vscode' ? value : 'both';
}

/** 設定の配列から知っている値だけを残す。全部あれば undefined（Claude Code の既定に任せる） */
function sourcesOf(values: readonly string[]): SettingSource[] | undefined {
  const known: SettingSource[] = ['user', 'project', 'local'];
  const picked = known.filter((k) => values.includes(k));
  return picked.length === known.length ? undefined : picked;
}
