import * as assert from 'assert';
import {
  createTask,
  transition,
  TaskStateError,
  type TaskEvent,
  type TaskStatus,
} from '../../../domain/task';

suite('transition', () => {
  const allowed: [TaskStatus, TaskEvent, TaskStatus][] = [
    ['running', 'permission-requested', 'waiting'],
    ['running', 'question-asked', 'waiting'],
    ['waiting', 'answered', 'running'],
    ['running', 'turn-completed', 'done'],
    ['running', 'error', 'failed'],
    ['waiting', 'error', 'failed'],
    ['running', 'stop', 'interrupted'],
    ['waiting', 'stop', 'interrupted'],
    ['running', 'host-exit', 'interrupted'],
    ['waiting', 'host-exit', 'interrupted'],
    ['done', 'prompt', 'running'],
    ['failed', 'prompt', 'running'],
    ['interrupted', 'prompt', 'running'],
    ['interrupted', 'resume', 'running'],
  ];

  for (const [from, event, to] of allowed) {
    test(`${from} + ${event} → ${to}`, () => {
      assert.strictEqual(transition(from, event), to);
    });
  }

  const rejected: [TaskStatus, TaskEvent][] = [
    ['done', 'answered'],
    ['done', 'turn-completed'],
    ['done', 'stop'],
    ['failed', 'answered'],
    ['interrupted', 'answered'],
    ['running', 'answered'],
    ['running', 'prompt'],
    ['running', 'resume'],
    ['waiting', 'turn-completed'],
    ['waiting', 'permission-requested'],
    ['done', 'resume'],
  ];

  for (const [from, event] of rejected) {
    test(`${from} + ${event} は許されない`, () => {
      assert.throws(() => transition(from, event), TaskStateError);
    });
  }

  test('許されない遷移のエラーには、状態とイベントが入る', () => {
    assert.throws(
      () => transition('done', 'answered'),
      (e: unknown) => e instanceof TaskStateError && e.status === 'done' && e.event === 'answered'
    );
  });
});

suite('createTask', () => {
  const base = {
    id: 'task-1',
    prompt: 'README に使い方の節を足して',
    cwd: 'D:\\work\\sample',
    createdAt: '2026-09-23T10:00:00.000Z',
  };

  test('作成直後は実行中で、ターンと常に許可の一覧は空', () => {
    const task = createTask(base);
    assert.strictEqual(task.id, 'task-1');
    assert.strictEqual(task.status, 'running');
    assert.strictEqual(task.cwd, base.cwd);
    assert.deepStrictEqual(task.turns, []);
    assert.deepStrictEqual(task.alwaysAllowed, []);
    assert.strictEqual(task.sessionId, undefined);
    assert.strictEqual(task.parentTaskId, undefined);
    assert.strictEqual(task.createdAt, base.createdAt);
    assert.strictEqual(task.updatedAt, base.createdAt);
  });

  test('タイトルを省略すると、指示の先頭から作る', () => {
    assert.strictEqual(createTask(base).title, 'README に使い方の節を足して');
  });

  test('タイトルを渡すと、そのまま使う', () => {
    assert.strictEqual(createTask({ ...base, title: '使い方' }).title, '使い方');
  });

  test('空の指示ではタスクを作れない', () => {
    assert.throws(() => createTask({ ...base, prompt: '   ' }), /prompt/);
  });

  test('承認方式の既定は毎回確認', () => {
    assert.strictEqual(createTask(base).permissionMode, 'default');
    assert.strictEqual(
      createTask({ ...base, permissionMode: 'acceptEdits' }).permissionMode,
      'acceptEdits'
    );
  });

  test('モデルは省略できる', () => {
    assert.strictEqual(createTask(base).model, undefined);
    assert.strictEqual(createTask({ ...base, model: 'claude-sonnet-5' }).model, 'claude-sonnet-5');
  });

  test('切り出し元のタスクを持てる', () => {
    assert.strictEqual(createTask({ ...base, parentTaskId: 'task-0' }).parentTaskId, 'task-0');
  });
});
