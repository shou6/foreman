import { groupOf } from './sidebar';
import type { Task } from './task';

/** ステータスバーに出す件数。サイドバーのグループと同じ数え方 */
export interface StatusCounts {
  running: number;
  /** あなたの番（承認待ち・質問あり・返答済み・失敗・中断） */
  yourTurn: number;
  review: number;
}

export function statusCounts(tasks: readonly Pick<Task, 'status'>[]): StatusCounts {
  const counts: StatusCounts = { running: 0, yourTurn: 0, review: 0 };
  for (const task of tasks) {
    switch (groupOf(task.status)) {
      case 'running':
        counts.running++;
        break;
      case 'waiting':
        counts.yourTurn++;
        break;
      case 'review':
        counts.review++;
        break;
      default:
        break;
    }
  }
  return counts;
}
