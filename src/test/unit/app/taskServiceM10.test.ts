import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { InMemoryTaskStore } from '../../support/fakes/inMemoryTaskStore';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function build(): { service: TaskService; runner: FakeAgentRunner; store: InMemoryTaskStore } {
  const runner = new FakeAgentRunner();
  const store = new InMemoryTaskStore();
  let counter = 0;
  const service = new TaskService({
    runner,
    store,
    newId: () => `task-${++counter}`,
    now: () => '2026-09-24T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  return { service, runner, store };
}

suite('TaskService: 下書き（M10）', () => {
  test('下書きは保存されるだけで、セッションは起動しない', async () => {
    const h = build();
    const task = await h.service.createDraft({ prompt: 'later', cwd: 'D:\\w' });
    assert.strictEqual(task.status, 'draft');
    assert.strictEqual(task.draftPrompt, 'later');
    assert.strictEqual(task.title, 'later');
    assert.deepStrictEqual(task.turns, []);
    assert.strictEqual(h.runner.starts.length, 0);
  });

  test('下書きの指示を書き換えられ、タイトルも追従する', async () => {
    const h = build();
    await h.service.createDraft({ prompt: 'later', cwd: 'D:\\w' });
    await h.service.updateDraft('task-1', 'fix the README');
    const task = await h.service.load('task-1');
    assert.strictEqual(task?.draftPrompt, 'fix the README');
    assert.strictEqual(task?.title, 'fix the README');
  });

  test('下書きを開始すると、その指示で最初のターンが始まり実行中になる', async () => {
    const h = build();
    await h.service.createDraft({ prompt: 'later', cwd: 'D:\\w', model: 'claude-haiku-4-5' });
    const started = await h.service.start('task-1');
    assert.strictEqual(started.status, 'running');
    assert.strictEqual(started.turns[0]?.prompt, 'later');
    assert.strictEqual(started.draftPrompt, undefined);
    assert.strictEqual(h.runner.starts.length, 1);
    assert.strictEqual(h.runner.last.options.prompt, 'later');
    assert.strictEqual(h.runner.last.options.model, 'claude-haiku-4-5');
  });

  test('開始時に worktree を渡すと、その場所で動く', async () => {
    const h = build();
    await h.service.createDraft({ prompt: 'later', cwd: 'D:\\w' });
    const worktree = {
      repo: 'D:\\w',
      path: 'D:\\w\\.foreman\\worktrees\\later-task1',
      branch: 'foreman/later-task1',
      base: 'main',
    };
    const started = await h.service.start('task-1', { worktree });
    assert.strictEqual(started.cwd, worktree.path);
    assert.deepStrictEqual(started.worktree, worktree);
    assert.strictEqual(h.runner.last.options.cwd, worktree.path);
  });

  test('下書きでないタスクは開始できない', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    await assert.rejects(h.service.start('task-1'), /draft/);
  });

  test('起動時の復旧で下書きはそのまま', async () => {
    const h = build();
    await h.service.createDraft({ prompt: 'later', cwd: 'D:\\w' });
    await h.service.recover();
    assert.strictEqual((await h.service.load('task-1'))?.status, 'draft');
  });
});

suite('TaskService: レビュー待ち（M10）', () => {
  test('変更を伴うターンが終わるとレビュー待ちになる', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    await h.service.patch('task-1', (t) => ({
      ...t,
      turns: t.turns.map((turn) => ({
        ...turn,
        changes: [{ path: 'a.txt', kind: 'modified', source: 'edit-tool', reverted: false }],
      })),
    }));
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.strictEqual((await h.service.load('task-1'))?.status, 'review');
  });

  test('変更の無いターンの終了は入力待ち（次の指示待ち）', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.strictEqual((await h.service.load('task-1'))?.status, 'waiting');
  });

  test('ターンの終了の後に変更が記録されたら、レビュー待ちに進む（差分の記録が遅れて届く場合）', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await h.service.recordChanges('task-1', 0, [
      { path: 'a.txt', kind: 'modified', source: 'edit-tool', reverted: false },
    ]);
    const task = await h.service.load('task-1');
    assert.strictEqual(task?.status, 'review');
    assert.strictEqual(task?.turns[0]?.changes.length, 1);
  });

  test('変更が空なら状態は変えない', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await h.service.recordChanges('task-1', 0, []);
    assert.strictEqual((await h.service.load('task-1'))?.status, 'waiting');
  });

  test('承認すると完了になる。実行中は承認できない', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await h.service.recordChanges('task-1', 0, [
      { path: 'a.txt', kind: 'modified', source: 'edit-tool', reverted: false },
    ]);
    await h.service.approve('task-1');
    assert.strictEqual((await h.service.load('task-1'))?.status, 'done');
    await h.service.create({ prompt: 'q', cwd: 'D:\\w' });
    await assert.rejects(h.service.approve('task-2'), /running/);
  });

  test('レビュー待ちのタスクへ追加の指示を送ると実行中に戻る', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    h.runner.last.emit({ type: 'init', sessionId: 's', model: 'm' });
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await h.service.recordChanges('task-1', 0, [
      { path: 'a.txt', kind: 'modified', source: 'edit-tool', reverted: false },
    ]);
    await h.service.send('task-1', 'more');
    assert.strictEqual((await h.service.load('task-1'))?.status, 'running');
  });
});

suite('TaskService: 並べ替え（M10）', () => {
  test('ID の並びを渡すと、その順番を order に保存する', async () => {
    const h = build();
    await h.service.createDraft({ prompt: 'a', cwd: 'D:\\w' });
    await h.service.createDraft({ prompt: 'b', cwd: 'D:\\w' });
    await h.service.createDraft({ prompt: 'c', cwd: 'D:\\w' });
    await h.service.reorder(['task-3', 'task-1', 'task-2']);
    assert.strictEqual((await h.service.load('task-3'))?.order, 0);
    assert.strictEqual((await h.service.load('task-1'))?.order, 1);
    assert.strictEqual((await h.service.load('task-2'))?.order, 2);
  });
});

suite('TaskService: タスク名の変更', () => {
  test('任意の名前に変えられる。空白だけは受け付けない', async () => {
    const h = build();
    await h.service.createDraft({ prompt: 'a long prompt', cwd: 'D:\w' });
    await h.service.rename('task-1', '  短い名前  ');
    assert.strictEqual((await h.service.load('task-1'))?.title, '短い名前');
    await assert.rejects(h.service.rename('task-1', '   '), /empty/);
  });
});
