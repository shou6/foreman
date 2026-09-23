import * as assert from 'assert';
import { TaskService, type TaskEventNotification } from '../../../app/taskService';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function build(runner: FakeAgentRunner): TaskService {
  return new TaskService({
    runner,
    store: new InMemoryTaskStore(),
    newId: () => 'task-1',
    now: () => '2026-09-23T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
}

suite('TaskService.onDidReceiveEvent', () => {
  test('Runner のイベントを、タスク ID と現在のターンの番号つきで伝える', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
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

suite('TaskService.dispose', () => {
  test('動いているセッションの入力を閉じて、プロセスを終わらせる', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: 'D:\\work' });
    service.dispose();
    assert.strictEqual(runner.last.closed, true);
  });
});

suite('TaskService.recover', () => {
  test('中断に直したタスクには、そのターンの中断の turn-end を伝える', async () => {
    const store = new InMemoryTaskStore();
    await store.save({
      id: 'stale',
      title: 'stale',
      status: 'running',
      cwd: 'D:\\work',
      permissionMode: 'default',
      alwaysAllowed: [],
      turns: [
        { index: 0, prompt: 'a', attachments: [], startedAt: 't', endedAt: 't', changes: [] },
        { index: 1, prompt: 'b', attachments: [], startedAt: 't', changes: [] },
      ],
      createdAt: 't',
      updatedAt: 't',
    });
    const service = new TaskService({
      runner: new FakeAgentRunner(),
      store,
      newId: () => 'x',
      now: () => '2026-09-23T10:00:00.000Z',
      approve: async () => ({ behavior: 'deny', message: 'test' }),
    });
    const received: TaskEventNotification[] = [];
    service.onDidReceiveEvent((n) => received.push(n));
    await service.recover();
    assert.deepStrictEqual(received, [
      {
        taskId: 'stale',
        turn: 1,
        event: { type: 'turn-end', ok: false, interrupted: true, reason: 'VS Code was closed' },
      },
    ]);
    const task = await store.load('stale');
    assert.strictEqual(task?.status, 'interrupted');
    assert.deepStrictEqual(task?.turns[1]?.result, { ok: false, reason: 'VS Code was closed' });
    assert.strictEqual(task?.turns[1]?.endedAt, '2026-09-23T10:00:00.000Z');
  });
});
