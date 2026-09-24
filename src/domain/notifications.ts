import type { TaskStatus } from './task';

/** 設定 foreman.notifications */
export type NotificationSetting = 'all' | 'waiting' | 'none';

export type NotificationKind = 'waiting' | 'review' | 'failed';

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
  // 完了になるのはユーザーの操作（承認、完了にする）だけなので、完了は知らせない
  if (setting === 'all' && (next === 'failed' || next === 'review')) {
    return next;
  }
  return undefined;
}
