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
    await service.create({
      prompt: 'p',
      cwd: CWD,
      attachments: [{ kind: 'file', path: 'D:\\work\\a.ts' }],
    });
    assert.strictEqual(runner.last.options.prompt, 'p\n\nAttached files:\n- D:\\work\\a.ts');
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await service.send('task-1', 'more', [{ kind: 'file', path: 'D:\\work\\b.ts' }]);
    assert.deepStrictEqual(runner.last.sent, ['more\n\nAttached files:\n- D:\\work\\b.ts']);
    const task = await service.load('task-1');
    assert.deepStrictEqual(task?.turns[0]?.attachments, [{ kind: 'file', path: 'D:\\work\\a.ts' }]);
    assert.deepStrictEqual(task?.turns[1]?.attachments, [{ kind: 'file', path: 'D:\\work\\b.ts' }]);
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

suite('TaskService: Effort', () => {
  test('作成時の Effort を保存し、起動に渡す', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD, effort: 'medium' });
    assert.strictEqual(runner.last.options.effort, 'medium');
    assert.strictEqual((await service.load('task-1'))?.effort, 'medium');
  });

  test('Effort の切り替えは保存し、動いているセッションにも伝える', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD });
    await service.setEffort('task-1', 'max');
    assert.deepStrictEqual(runner.last.efforts, ['max']);
    assert.strictEqual((await service.load('task-1'))?.effort, 'max');
    await service.setEffort('task-1', undefined);
    assert.deepStrictEqual(runner.last.efforts, ['max', undefined]);
    assert.strictEqual((await service.load('task-1'))?.effort, undefined);
  });
});

suite('TaskService: 実際に使われる Effort', () => {
  test('effort のイベントで、実際に使われる Effort を記録する', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD });
    runner.last.emit({ type: 'effort', effort: 'medium' });
    await settle();
    assert.strictEqual((await service.load('task-1'))?.activeEffort, 'medium');
    runner.last.emit({ type: 'effort', effort: undefined });
    await settle();
    assert.strictEqual((await service.load('task-1'))?.activeEffort, undefined);
  });
});

suite('TaskService: プランモード', () => {
  test('承認方式の切り替えは保存し、動いているセッションにも伝える', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD });
    await service.setPermissionMode('task-1', 'plan');
    assert.deepStrictEqual(runner.last.modes, ['plan']);
    assert.strictEqual((await service.load('task-1'))?.permissionMode, 'plan');
  });

  test('ExitPlanMode を許可すると、タスクの承認方式も default に戻る', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD, permissionMode: 'plan' });
    assert.strictEqual(runner.last.options.permissionMode, 'plan');
    await runner.last.requestPermission({
      toolName: 'ExitPlanMode',
      input: { plan: '# Plan' },
      suggestions: [],
    });
    assert.strictEqual((await service.load('task-1'))?.permissionMode, 'default');
  });
});

suite('TaskService: コンテキストの圧縮', () => {
  test('返答を待っている間だけ圧縮できる。動いている間と、セッションが無い時は断る', async () => {
    const runner = new FakeAgentRunner();
    const service = build(runner);
    await service.create({ prompt: 'p', cwd: CWD });
    await assert.rejects(service.compact('task-1'), /running/);
    runner.last.emit({ type: 'init', sessionId: 's', model: 'm' });
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await service.compact('task-1');
    assert.strictEqual(runner.last.compacted, 1);
    runner.last.close();
    await settle();
    await assert.rejects(service.compact('task-1'), /session/);
  });
});
