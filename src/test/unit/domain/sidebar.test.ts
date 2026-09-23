import * as assert from 'assert';
import { elapsedMinutes, sidebarOf } from '../../../domain/sidebar';
import type { Task, TaskStatus, Turn } from '../../../domain/task';

const NOW = '2026-09-24T10:10:00.000Z';

function turn(extra: Partial<Turn> = {}): Turn {
  return {
    index: 0,
    prompt: 'p',
    attachments: [],
    startedAt: '2026-09-24T10:06:00.000Z',
    changes: [],
    ...extra,
  };
}

function task(id: string, status: TaskStatus, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `title ${id}`,
    status,
    cwd: 'D:\\w',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [],
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
    ...extra,
  };
}

suite('sidebar: 一覧のグループ', () => {
  test('入力待ち、実行中、レビュー待ち、下書き、完了の順に、空でないグループだけ並ぶ', () => {
    const groups = sidebarOf(
      [task('a', 'done'), task('b', 'running', { turns: [turn()] }), task('c', 'waiting')],
      { now: NOW, pendingApproval: new Set() }
    );
    assert.deepStrictEqual(
      groups.map((g) => g.key),
      ['waiting', 'running', 'done']
    );
    assert.strictEqual(groups[0]?.items[0]?.id, 'c');
  });

  test('失敗と中断は実行中のグループに入り、バッジで区別する', () => {
    const groups = sidebarOf([task('a', 'failed'), task('b', 'interrupted')], {
      now: NOW,
      pendingApproval: new Set(),
    });
    assert.strictEqual(groups[0]?.key, 'running');
    assert.deepStrictEqual(
      groups[0]?.items.map((i) => i.badge),
      [{ kind: 'failed' }, { kind: 'interrupted' }]
    );
  });

  test('入力待ちのバッジは、承認待ちか返答ありかで分かれる', () => {
    const groups = sidebarOf(
      [
        task('a', 'waiting', { turns: [turn()] }),
        task('b', 'waiting', { turns: [turn({ endedAt: NOW, result: { ok: true } })] }),
      ],
      { now: NOW, pendingApproval: new Set(['a']) }
    );
    assert.deepStrictEqual(groups[0]?.items[0]?.badge, { kind: 'approval' });
    assert.deepStrictEqual(groups[0]?.items[1]?.badge, { kind: 'replied' });
  });

  test('実行中は経過分数、レビュー待ちは変更ファイル数をバッジにする', () => {
    const groups = sidebarOf(
      [
        task('a', 'running', { turns: [turn()] }),
        task('b', 'review', {
          turns: [
            turn({
              endedAt: NOW,
              changes: [
                { path: 'x', kind: 'modified', source: 'edit-tool', reverted: false },
                { path: 'y', kind: 'modified', source: 'edit-tool', reverted: false },
              ],
            }),
          ],
        }),
      ],
      { now: NOW, pendingApproval: new Set() }
    );
    assert.deepStrictEqual(groups.find((g) => g.key === 'running')?.items[0]?.badge, {
      kind: 'elapsed',
      minutes: 4,
    });
    assert.deepStrictEqual(groups.find((g) => g.key === 'review')?.items[0]?.badge, {
      kind: 'review',
      files: 2,
    });
  });

  test('2 行目にはブランチ（無ければ空）と、全ターンの変更ファイル数が入る', () => {
    const groups = sidebarOf(
      [
        task('a', 'done', {
          worktree: {
            repo: 'D:\\w',
            path: 'D:\\w\\.foreman\\worktrees\\a',
            branch: 'foreman/a',
            base: 'main',
          },
          turns: [
            turn({
              changes: [{ path: 'x', kind: 'modified', source: 'edit-tool', reverted: false }],
            }),
            turn({
              index: 1,
              changes: [
                { path: 'x', kind: 'modified', source: 'edit-tool', reverted: false },
                { path: 'y', kind: 'created', source: 'edit-tool', reverted: false },
              ],
            }),
          ],
        }),
        task('b', 'done'),
      ],
      { now: NOW, pendingApproval: new Set() }
    );
    const [a, b] = groups[0]?.items ?? [];
    assert.strictEqual(a?.branch, 'foreman/a');
    assert.strictEqual(a?.files, 2, '同じファイルは 1 つに数える');
    assert.strictEqual(b?.branch, undefined);
    assert.strictEqual(b?.files, 0);
  });

  test('グループの中は order、次に更新の新しい順', () => {
    const groups = sidebarOf(
      [
        task('a', 'done', { updatedAt: '2026-09-24T09:00:00.000Z' }),
        task('b', 'done', { updatedAt: '2026-09-24T09:30:00.000Z' }),
        task('c', 'done', { order: 0 }),
      ],
      { now: NOW, pendingApproval: new Set() }
    );
    assert.deepStrictEqual(
      groups[0]?.items.map((i) => i.id),
      ['c', 'b', 'a']
    );
  });
});

suite('sidebar: 経過時間', () => {
  test('開始からの分数を切り捨てで返す。開始が無ければ undefined', () => {
    assert.strictEqual(elapsedMinutes('2026-09-24T10:06:00.000Z', NOW), 4);
    assert.strictEqual(elapsedMinutes('2026-09-24T10:09:30.000Z', NOW), 0);
    assert.strictEqual(elapsedMinutes(undefined, NOW), undefined);
  });
});
