import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const CWD = 'D:\\work';

function build(runner: FakeAgentRunner): TaskService {
  return new TaskService({
    runner,
    store: new InMemoryTaskStore(),
    newId: () => 'task-1',
    now: () => '2026-09-23T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
}

suite('TaskService: 添付とモデル', () => {
  test('添付つきの指示は、ターンに添付を残し、Runner にはパスを列挙した指示を送る', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD, attachments: ['D:\\work\\a.ts'] });
    assert.strictEqual(runner.last.options.prompt, 'p\n\nAttached files:\n- D:\\work\\a.ts');
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await service.send('task-1', 'more', ['D:\\work\\b.ts']);
    assert.deepStrictEqual(runner.last.sent, ['more\n\nAttached files:\n- D:\\work\\b.ts']);
    const task = await service.load('task-1');
    assert.deepStrictEqual(task?.turns[0]?.attachments, ['D:\\work\\a.ts']);
    assert.deepStrictEqual(task?.turns[1]?.attachments, ['D:\\work\\b.ts']);
    assert.strictEqual(task?.turns[1]?.prompt, 'more');
  });

  test('init で実際に動いているモデルを記録する', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD, model: 'claude-sonnet-5' });
    runner.last.emit({ type: 'init', sessionId: 's', model: 'claude-sonnet-5-20260901' });
    await settle();
    const task = await service.load('task-1');
    assert.strictEqual(task?.model, 'claude-sonnet-5');
    assert.strictEqual(task?.activeModel, 'claude-sonnet-5-20260901');
  });

  test('モデルの切り替えは保存し、動いているセッションにも伝える', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD });
    await service.setModel('task-1', 'claude-opus-5');
    assert.deepStrictEqual(runner.last.models, ['claude-opus-5']);
    assert.strictEqual((await service.load('task-1'))?.model, 'claude-opus-5');
    await service.setModel('task-1', undefined);
    assert.deepStrictEqual(runner.last.models, ['claude-opus-5', undefined]);
    assert.strictEqual((await service.load('task-1'))?.model, undefined);
  });
});
