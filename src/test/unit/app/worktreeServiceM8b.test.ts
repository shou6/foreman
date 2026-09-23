import * as assert from 'assert';
import { WorktreeService } from '../../../app/worktreeService';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { FakeGit } from '../../support/fakes/fakeGit';

const REPO = 'D:\\work\\repo';

suite('WorktreeService: ブランチ名の接頭辞', () => {
  test('設定した接頭辞でブランチを切る', async () => {
    const git = new FakeGit(REPO, 'main');
    const service = new WorktreeService({ git, sep: '\\', branchPrefix: () => 'wip/' });
    const wt = await service.create(REPO, 'Fix', 'abcdef0123');
    assert.strictEqual(wt.branch, 'wip/fix-abcdef');
  });

  test('接頭辞が空でも、末尾に / が無くても壊れない', async () => {
    const git = new FakeGit(REPO, 'main');
    const empty = new WorktreeService({ git, sep: '\\', branchPrefix: () => '' });
    assert.strictEqual((await empty.create(REPO, 'a', 'aaaaaa0000')).branch, 'a-aaaaaa');
    const noSlash = new WorktreeService({ git, sep: '\\', branchPrefix: () => 'task' });
    assert.strictEqual((await noSlash.create(REPO, 'b', 'bbbbbb0000')).branch, 'task/b-bbbbbb');
  });

  test('後片付けは、接頭辞に関係なく worktree の場所で判断する', async () => {
    const git = new FakeGit(REPO, 'main');
    const service = new WorktreeService({ git, sep: '\\', branchPrefix: () => 'wip/' });
    const orphan = await service.create(REPO, 'x', 'cccccc0000');
    await service.cleanupOrphans(REPO, []);
    assert.ok(!(await git.listWorktrees(REPO)).includes(orphan.path));
    assert.ok(!git.repos.get(REPO)!.branches.has(orphan.branch));
  });
});

suite('TaskService.close', () => {
  test('セッションの入力を閉じてプロセスの終了を待つ。タスクの状態は変えない', async () => {
    const runner = new FakeAgentRunner();
    const service = new TaskService({
      runner,
      store: new InMemoryTaskStore(),
      newId: () => 'task-1',
      now: () => '2026-09-24T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    await service.create({ prompt: 'p', cwd: REPO });
    runner.last.emit({ type: 'turn-end', ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    await service.close('task-1');
    assert.strictEqual(runner.last.closed, true);
    assert.strictEqual((await service.load('task-1'))?.status, 'done');
    // 閉じた後の追加の指示は resume で続く
    await service.send('task-1', 'more');
    assert.strictEqual(runner.resumes.length, 0, 'session_id が無いので再開できず失敗する');
  });
});
