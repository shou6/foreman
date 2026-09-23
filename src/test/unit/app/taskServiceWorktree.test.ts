import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

suite('TaskService: worktree', () => {
  test('worktree を渡して作ると、Claude はその場所で動き、タスクに記録が残る', async () => {
    const runner = new FakeAgentRunner();
    const service = new TaskService({
      runner,
      store: new InMemoryTaskStore(),
      newId: () => 'task-1',
      now: () => '2026-09-24T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    const worktree = {
      repo: 'D:\\repo',
      path: 'D:\\repo\\.foreman\\worktrees\\t-task-1',
      branch: 'foreman/t-task-1',
      base: 'main',
    };
    const task = await service.create({ prompt: 'p', cwd: 'D:\\repo', worktree });
    assert.strictEqual(task.cwd, worktree.path);
    assert.deepStrictEqual(task.worktree, worktree);
    assert.strictEqual(runner.last.options.cwd, worktree.path);
  });
});
