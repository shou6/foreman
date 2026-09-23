import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import type { Task } from '../../../domain/task';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

suite('TaskService: 再開時の指示', () => {
  test('中断したタスクを再開する時は、中断した指示を添えて Runner に送る', async () => {
    const runner = new FakeAgentRunner();
    const service = new TaskService({
      runner,
      store: new InMemoryTaskStore(),
      newId: () => 'task-1',
      now: () => '2026-09-23T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    await service.create({ prompt: 'add a test', cwd: 'D:\\work' });
    runner.last.emit({ type: 'init', sessionId: 's', model: 'm' });
    await settle();
    await service.stop('task-1');
    await settle();
    runner.last.finish();
    await settle();

    await service.resume('task-1', 'continue');
    assert.strictEqual(
      runner.last.options.prompt,
      'The previous instruction was interrupted before it finished: "add a test". Continue from there if it still applies.\n\ncontinue'
    );
    // 記録される指示はユーザーが打ったもの
    assert.strictEqual((await service.load('task-1'))?.turns[1]?.prompt, 'continue');
  });
});

suite('TaskService.onDidDelete', () => {
  test('消したタスクの中身も一緒に伝える（後片付けに使う）', async () => {
    const service = new TaskService({
      runner: new FakeAgentRunner(),
      store: new InMemoryTaskStore(),
      newId: () => 'task-1',
      now: () => '2026-09-23T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    const deleted: { id: string; task: Task }[] = [];
    service.onDidDelete((id, task) => {
      deleted.push({ id, task });
    });
    await service.create({ prompt: 'p', cwd: 'D:\\work' });
    await service.delete('task-1');
    assert.strictEqual(deleted[0]?.id, 'task-1');
    assert.strictEqual(deleted[0]?.task.title, 'p');
  });
});
