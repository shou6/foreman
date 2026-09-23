import * as assert from 'assert';
import { TaskService, type TaskEventNotification } from '../../../app/taskService';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

suite('TaskService.onDidReceiveEvent', () => {
  test('Runner のイベントを、タスク ID と現在のターンの番号つきで伝える', async () => {
    const runner = new FakeAgentRunner();
    const service = new TaskService({
      runner,
      store: new InMemoryTaskStore(),
      newId: () => 'task-1',
      now: () => '2026-09-23T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    const received: TaskEventNotification[] = [];
    service.onDidReceiveEvent((n) => received.push(n));

    await service.create({ prompt: 'p', cwd: 'D:\\work' });
    runner.last.emit({ type: 'text', text: 'hi' });
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await service.send('task-1', 'more');
    runner.last.emit({ type: 'text', text: 'again' });
    await settle();

    assert.deepStrictEqual(received, [
      { taskId: 'task-1', turn: 0, event: { type: 'text', text: 'hi' } },
      { taskId: 'task-1', turn: 0, event: { type: 'turn-end', ok: true } },
      { taskId: 'task-1', turn: 1, event: { type: 'text', text: 'again' } },
    ]);
  });
});
