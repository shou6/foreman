import * as assert from 'assert';
import { boardOf, columnOf, moveAllowed, type BoardColumnKey } from '../../../domain/board';
import type { Task, TaskStatus } from '../../../domain/task';

function task(id: string, status: TaskStatus, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `title ${id}`,
    status,
    cwd: 'D:\\w',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [],
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...extra,
  };
}

suite('board: 列への振り分け', () => {
  test('失敗と中断は「実行中」の列にバッジ付きで入り、ほかは状態の列に入る', () => {
    const cases: [TaskStatus, BoardColumnKey][] = [
      ['draft', 'draft'],
      ['running', 'running'],
      ['failed', 'running'],
      ['interrupted', 'running'],
      ['waiting', 'waiting'],
      ['review', 'review'],
      ['done', 'done'],
    ];
    for (const [status, column] of cases) {
      assert.strictEqual(columnOf(status), column, status);
    }
  });

  test('列は下書き、実行中、入力待ち、レビュー待ち、完了の順。カードは order、次に更新の新しい順', () => {
    const board = boardOf([
      task('a', 'done', { updatedAt: '2026-09-24T01:00:00.000Z' }),
      task('b', 'done', { updatedAt: '2026-09-24T02:00:00.000Z' }),
      task('c', 'done', { order: 0, updatedAt: '2026-09-24T00:00:00.000Z' }),
      task('d', 'failed', {
        turns: [
          {
            index: 0,
            prompt: 'p',
            attachments: [],
            startedAt: '',
            changes: [],
            result: { ok: false, reason: 'boom' },
          },
        ],
      }),
      task('e', 'draft', { draftPrompt: 'later' }),
    ]);
    assert.deepStrictEqual(
      board.map((c) => c.key),
      ['draft', 'running', 'waiting', 'review', 'done']
    );
    assert.deepStrictEqual(
      board.find((c) => c.key === 'done')?.cards.map((t) => t.id),
      ['c', 'b', 'a']
    );
    const failed = board.find((c) => c.key === 'running')?.cards[0];
    assert.strictEqual(failed?.badge, 'failed');
    assert.strictEqual(board.find((c) => c.key === 'draft')?.cards[0]?.prompt, 'later');
  });

  test('カードには最後のターンの変更ファイル数と、worktree のブランチが入る', () => {
    const board = boardOf([
      task('a', 'review', {
        model: 'claude-haiku-4-5',
        worktree: {
          repo: 'D:\\w',
          path: 'D:\\w\\.foreman\\worktrees\\a',
          branch: 'foreman/a',
          base: 'main',
        },
        turns: [
          {
            index: 0,
            prompt: 'fix it',
            attachments: [],
            startedAt: '',
            changes: [
              { path: 'x', kind: 'modified', source: 'edit-tool', reverted: false },
              { path: 'y', kind: 'created', source: 'edit-tool', reverted: false },
            ],
          },
        ],
      }),
    ]);
    const card = board.find((c) => c.key === 'review')?.cards[0];
    assert.strictEqual(card?.changes, 2);
    assert.strictEqual(card?.branch, 'foreman/a');
    assert.strictEqual(card?.model, 'claude-haiku-4-5');
    assert.strictEqual(card?.prompt, 'fix it');
  });
});

suite('board: 列をまたぐ移動', () => {
  test('下書き → 実行中（開始）と、レビュー待ち → 完了（承認）だけ許す', () => {
    assert.strictEqual(moveAllowed('draft', 'running'), 'start');
    assert.strictEqual(moveAllowed('review', 'done'), 'approve');
    assert.strictEqual(moveAllowed('done', 'review'), undefined);
    assert.strictEqual(moveAllowed('running', 'done'), undefined);
    assert.strictEqual(moveAllowed('draft', 'draft'), undefined);
  });
});
