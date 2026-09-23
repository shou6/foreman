import type { TaskStatus } from './task';

/** 設定 foreman.notifications */
export type NotificationSetting = 'all' | 'waiting' | 'none';

export type NotificationKind = 'waiting' | 'done' | 'failed';

/** 状態の変化に対して出す通知の種類。出さないなら undefined */
export function notificationFor(
  previous: TaskStatus | undefined,
  next: TaskStatus,
  setting: NotificationSetting
): NotificationKind | undefined {
  if (setting === 'none' || previous === next) {
    return undefined;
  }
  if (next === 'waiting') {
    return 'waiting';
  }
  if (setting === 'all' && (next === 'done' || next === 'failed')) {
    return next;
  }
  return undefined;
}
