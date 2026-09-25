import * as assert from 'assert';
import { tasksToPrune } from '../../../domain/retention';
import type { FileChange, Task, TaskStatus } from '../../../domain/task';

const CHANGE: FileChange = {
  path: 'a.txt',
  kind: 'modified',
  before: 'h1',
  after: 'h2',
  source: 'edit-tool',
  reverted: false,
};

function task(id: string, status: TaskStatus, updatedAt: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    status,
    cwd: 'D:\\w',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [{ index: 0, prompt: 'p', attachments: [], startedAt: updatedAt, changes: [CHANGE] }],
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  };
}

const NOW = '2026-09-25T00:00:00.000Z';

suite('retention: 古いスナップショットを消すタスク', () => {
  test('完了して保存期間（日数）を過ぎたタスクだけを選ぶ', () => {
    const tasks = [
      task('old-done', 'done', '2026-08-25T00:00:00.000Z'),
      task('recent-done', 'done', '2026-09-20T00:00:00.000Z'),
      task('old-waiting', 'waiting', '2026-08-01T00:00:00.000Z'),
      task('old-review', 'review', '2026-08-01T00:00:00.000Z'),
    ];
    assert.deepStrictEqual(tasksToPrune(tasks, NOW, 30), ['old-done']);
  });

  test('ちょうど保存期間の日数なら、まだ消さない', () => {
    assert.deepStrictEqual(
      tasksToPrune([task('edge', 'done', '2026-08-26T00:00:00.000Z')], NOW, 30),
      []
    );
  });

  test('すでに消したタスクと、スナップショットの無いタスクは選ばない', () => {
    const tasks = [
      task('pruned', 'done', '2026-01-01T00:00:00.000Z', {
        snapshotsPrunedAt: '2026-02-01T00:00:00.000Z',
      }),
      task('empty', 'done', '2026-01-01T00:00:00.000Z', {
        turns: [{ index: 0, prompt: 'p', attachments: [], startedAt: NOW, changes: [] }],
      }),
    ];
    assert.deepStrictEqual(tasksToPrune(tasks, NOW, 30), []);
  });

  test('日数が 0 以下なら消さない（無期限に残す）', () => {
    const tasks = [task('old-done', 'done', '2020-01-01T00:00:00.000Z')];
    assert.deepStrictEqual(tasksToPrune(tasks, NOW, 0), []);
  });
});
