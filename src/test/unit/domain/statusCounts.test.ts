import * as assert from 'assert';
import { statusCounts } from '../../../domain/statusCounts';
import type { Task, TaskStatus } from '../../../domain/task';

function task(id: string, status: TaskStatus): Task {
  return {
    id,
    title: id,
    status,
    cwd: 'D:\\w',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [],
    createdAt: '',
    updatedAt: '',
  };
}

suite('statusCounts', () => {
  test('実行中と「あなたの番」（入力待ち・失敗・中断）を数える。サイドバーのグループと同じ数え方', () => {
    const counts = statusCounts([
      task('a', 'running'),
      task('b', 'running'),
      task('c', 'waiting'),
      task('d', 'failed'),
      task('e', 'interrupted'),
      task('f', 'review'),
      task('g', 'done'),
      task('h', 'draft'),
    ]);
    assert.deepStrictEqual(counts, { running: 2, yourTurn: 3, review: 1 });
  });
});
