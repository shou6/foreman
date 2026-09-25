import type { Task } from './task';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * スナップショットを消すタスク。完了して保存期間（日数）を過ぎたものだけ。
 * すでに消したもの、スナップショットの無いものは選ばない。日数が 0 以下なら消さない（無期限）
 */
export function tasksToPrune(tasks: readonly Task[], now: string, days: number): string[] {
  if (days <= 0) {
    return [];
  }
  const limit = Date.parse(now) - days * DAY_MS;
  return tasks
    .filter(
      (task) =>
        task.status === 'done' &&
        task.snapshotsPrunedAt === undefined &&
        Date.parse(task.updatedAt) < limit &&
        task.turns.some((turn) =>
          turn.changes.some((c) => c.before !== undefined || c.after !== undefined)
        )
    )
    .map((task) => task.id);
}
