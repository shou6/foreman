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
  test('失敗と中断は「あなたの番」（waiting）の列に入り、ほかは状態の列に入る', () => {
    const cases: [TaskStatus, BoardColumnKey][] = [
      ['draft', 'draft'],
      ['running', 'running'],
      ['failed', 'waiting'],
      ['interrupted', 'waiting'],
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
    const failed = board.find((c) => c.key === 'waiting')?.cards[0];
    assert.strictEqual(failed?.kind, 'failed');
    assert.strictEqual(board.find((c) => c.key === 'draft')?.cards[0]?.prompt, 'later');
  });

  test('カードには最後のターンの変更ファイル数と、worktree のブランチ（接頭辞を外す）が入る', () => {
    const board = boardOf(
      [
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
      ],
      { branchPrefix: 'foreman/' }
    );
    const card = board.find((c) => c.key === 'review')?.cards[0];
    assert.strictEqual(card?.changes, 2);
    assert.strictEqual(card?.branch, 'a');
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

  test('同じ「あなたの番」の列でも、失敗・中断は完了へ移せない', () => {
    assert.strictEqual(moveAllowed('failed', 'done'), undefined);
    assert.strictEqual(moveAllowed('interrupted', 'done'), undefined);
  });
});

suite('board: 返答待ちのタスクの完了', () => {
  test('ターンが終わって次の指示を待っているタスクは「完了」へ移せる。動いている間は移せない', () => {
    assert.strictEqual(moveAllowed('waiting', 'done', false), 'approve');
    assert.strictEqual(moveAllowed('waiting', 'done', true), undefined);
  });

  test('カードに turnOpen と、状態の呼び名が入る', () => {
    const [card] =
      boardOf([
        task('a', 'waiting', {
          turns: [
            { index: 0, prompt: 'p', attachments: [], startedAt: '', endedAt: 't', changes: [] },
          ],
        }),
      ]).find((c) => c.key === 'waiting')?.cards ?? [];
    assert.strictEqual(card?.turnOpen, false);
    assert.strictEqual(card?.kind, 'replied');
  });

  test('承認や質問を待っているカードは、その呼び名になる', () => {
    const open = { index: 0, prompt: 'p', attachments: [], startedAt: '', changes: [] };
    const cards =
      boardOf(
        [
          task('a', 'waiting', { turns: [open], updatedAt: '2026-09-24T02:00:00.000Z' }),
          task('b', 'waiting', { turns: [open], updatedAt: '2026-09-24T01:00:00.000Z' }),
        ],
        {
          pending: new Map([
            ['a', 'approval'],
            ['b', 'question'],
          ]),
        }
      ).find((c) => c.key === 'waiting')?.cards ?? [];
    assert.deepStrictEqual(
      cards.map((c) => c.kind),
      ['approval', 'question']
    );
  });
});
