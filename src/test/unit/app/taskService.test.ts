import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import type { PermissionDecision, PermissionRequest } from '../../../domain/events';
import type { Task, TaskStatus } from '../../../domain/task';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { InMemoryTaskStore } from '../../support/fakes/inMemoryTaskStore';

interface Harness {
  service: TaskService;
  runner: FakeAgentRunner;
  store: InMemoryTaskStore;
  changes: { id: string; status: TaskStatus }[];
  decide: (decision: PermissionDecision) => void;
  requests: PermissionRequest[];
}

/** 依存をすべてフェイクにした TaskService を組み立てる */
function harness(): Harness {
  const runner = new FakeAgentRunner();
  const store = new InMemoryTaskStore();
  const changes: { id: string; status: TaskStatus }[] = [];
  const requests: PermissionRequest[] = [];
  let pending: ((decision: PermissionDecision) => void) | undefined;
  let counter = 0;
  const service = new TaskService({
    runner,
    store,
    newId: () => `task-${++counter}`,
    now: () => '2026-09-23T10:00:00.000Z',
    approve: (_taskId, request) => {
      requests.push(request);
      return new Promise<PermissionDecision>((resolve) => {
        pending = resolve;
      });
    },
  });
  service.onDidChange((task: Task) => changes.push({ id: task.id, status: task.status }));
  return {
    service,
    runner,
    store,
    changes,
    requests,
    decide: (decision) => {
      if (pending === undefined) {
        throw new Error('no pending permission request');
      }
      pending(decision);
      pending = undefined;
    },
  };
}

const CREATE = { prompt: 'README に使い方の節を足して', cwd: 'D:\\work\\sample' };

/** イベントの処理が非同期に一巡するのを待つ */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

suite('TaskService.create', () => {
  test('タスクを保存し、セッションを起動して、最初のターンを記録する', async () => {
    const h = harness();
    const task = await h.service.create(CREATE);

    assert.strictEqual(task.id, 'task-1');
    assert.strictEqual(task.status, 'running');
    assert.strictEqual(task.turns.length, 1);
    assert.strictEqual(task.turns[0]?.prompt, CREATE.prompt);
    assert.strictEqual(task.turns[0]?.index, 0);
    assert.strictEqual(task.turns[0]?.startedAt, '2026-09-23T10:00:00.000Z');
    assert.strictEqual((await h.store.load('task-1'))?.status, 'running');

    assert.strictEqual(h.runner.starts.length, 1);
    const options = h.runner.last.options;
    assert.strictEqual(options.cwd, CREATE.cwd);
    assert.strictEqual(options.prompt, CREATE.prompt);
    assert.strictEqual(options.permissionMode, 'default');
    assert.deepStrictEqual(options.alwaysAllowed, []);
  });

  test('モデルと承認方式を渡すと、Runner にもそのまま渡る', async () => {
    const h = harness();
    await h.service.create({ ...CREATE, model: 'claude-sonnet-5', permissionMode: 'acceptEdits' });
    assert.strictEqual(h.runner.last.options.model, 'claude-sonnet-5');
    assert.strictEqual(h.runner.last.options.permissionMode, 'acceptEdits');
  });

  test('init イベントで session_id を保存する', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'claude-opus-5' });
    await settle();
    assert.strictEqual((await h.store.load('task-1'))?.sessionId, 'sess-1');
  });

  test('init が 2 回届いても壊れない（モデルの切り替えで再送される）', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'claude-opus-5' });
    h.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'claude-sonnet-5' });
    await settle();
    const task = await h.store.load('task-1');
    assert.strictEqual(task?.sessionId, 'sess-1');
    assert.strictEqual(task?.status, 'running');
  });
});

suite('TaskService: ターンの終了', () => {
  test('正常に終わると完了になり、ターンに結果と終了時刻が入る', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({
      type: 'turn-end',
      ok: true,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        contextWindow: 200000,
      },
    });
    await settle();
    const task = await h.store.load('task-1');
    assert.strictEqual(task?.status, 'done');
    assert.deepStrictEqual(task?.turns[0]?.result, {
      ok: true,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        contextWindow: 200000,
      },
    });
    assert.strictEqual(task?.turns[0]?.endedAt, '2026-09-23T10:00:00.000Z');
    assert.deepStrictEqual(h.changes.at(-1), { id: 'task-1', status: 'done' });
  });

  test('エラーで終わると失敗になり、理由が残る', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'turn-end', ok: false, interrupted: false, reason: 'API error' });
    await settle();
    const task = await h.store.load('task-1');
    assert.strictEqual(task?.status, 'failed');
    assert.deepStrictEqual(task?.turns[0]?.result, { ok: false, reason: 'API error' });
  });

  test('中断で終わると中断になる', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'turn-end', ok: false, interrupted: true, reason: 'interrupted' });
    await settle();
    assert.strictEqual((await h.store.load('task-1'))?.status, 'interrupted');
  });

  test('プロセスが結果を出さずに終わると中断になる', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.finish();
    await settle();
    assert.strictEqual((await h.store.load('task-1'))?.status, 'interrupted');
  });

  test('完了の後にプロセスが終わっても、完了のまま', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    h.runner.last.finish();
    await settle();
    assert.strictEqual((await h.store.load('task-1'))?.status, 'done');
  });
});

suite('TaskService: 承認', () => {
  const REQUEST: PermissionRequest = {
    toolName: 'Edit',
    input: { file_path: 'README.md' },
    suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
  };

  test('承認の要求で入力待ちになり、返事で実行中に戻る', async () => {
    const h = harness();
    await h.service.create(CREATE);
    const decision = h.runner.last.requestPermission(REQUEST);
    await settle();
    assert.strictEqual((await h.store.load('task-1'))?.status, 'waiting');
    assert.deepStrictEqual(h.requests, [REQUEST]);

    h.decide({ behavior: 'allow' });
    assert.deepStrictEqual(await decision, { behavior: 'allow' });
    await settle();
    assert.strictEqual((await h.store.load('task-1'))?.status, 'running');
  });

  test('常に許可を選ぶと、返した内容をタスクに保存する', async () => {
    const h = harness();
    await h.service.create(CREATE);
    const decision = h.runner.last.requestPermission(REQUEST);
    await settle();
    h.decide({ behavior: 'allow-always', permissions: REQUEST.suggestions });
    await decision;
    await settle();
    assert.deepStrictEqual((await h.store.load('task-1'))?.alwaysAllowed, REQUEST.suggestions);
  });

  test('拒否の理由は Runner にそのまま返る', async () => {
    const h = harness();
    await h.service.create(CREATE);
    const decision = h.runner.last.requestPermission(REQUEST);
    await settle();
    h.decide({ behavior: 'deny', message: 'その変更は不要' });
    assert.deepStrictEqual(await decision, { behavior: 'deny', message: 'その変更は不要' });
  });
});

suite('TaskService: 追加の指示、停止、再開、削除', () => {
  test('完了したタスクへ追加の指示を送ると、新しいターンで実行中に戻る', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();

    await h.service.send('task-1', 'テストも足して');
    const task = await h.store.load('task-1');
    assert.strictEqual(task?.status, 'running');
    assert.strictEqual(task?.turns.length, 2);
    assert.strictEqual(task?.turns[1]?.prompt, 'テストも足して');
    assert.strictEqual(task?.turns[1]?.index, 1);
    assert.deepStrictEqual(h.runner.last.sent, ['テストも足して']);
  });

  test('実行中のタスクへは追加の指示を送れない', async () => {
    const h = harness();
    await h.service.create(CREATE);
    await assert.rejects(h.service.send('task-1', 'まだ途中'), /running/);
  });

  test('停止すると Runner を中断し、タスクは中断になる', async () => {
    const h = harness();
    await h.service.create(CREATE);
    await h.service.stop('task-1');
    await settle();
    assert.strictEqual(h.runner.last.interrupted, true);
    assert.strictEqual((await h.store.load('task-1'))?.status, 'interrupted');
  });

  test('中断したタスクを再開すると、同じセッションで新しいターンが始まる', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'claude-opus-5' });
    await settle();
    await h.service.stop('task-1');
    await settle();
    h.runner.last.finish();
    await settle();

    await h.service.resume('task-1', '続きをお願い');
    assert.strictEqual(h.runner.resumes.length, 1);
    assert.strictEqual(h.runner.resumes[0]?.sessionId, 'sess-1');
    // 中断した指示を添えて送る（resumePrompt）ので、末尾がユーザーの指示になる
    assert.ok(h.runner.last.options.prompt.endsWith('\n\n続きをお願い'));
    const task = await h.store.load('task-1');
    assert.strictEqual(task?.status, 'running');
    assert.strictEqual(task?.turns.length, 2);
  });

  test('再開時は保存した常に許可の内容を Runner に渡す', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'claude-opus-5' });
    const decision = h.runner.last.requestPermission({
      toolName: 'Edit',
      input: {},
      suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
    });
    await settle();
    h.decide({
      behavior: 'allow-always',
      permissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
    });
    await decision;
    await h.service.stop('task-1');
    await settle();

    await h.service.resume('task-1', '続き');
    assert.deepStrictEqual(h.runner.last.options.alwaysAllowed, [
      { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
    ]);
  });

  test('セッションが無いタスクは再開できない', async () => {
    const h = harness();
    await h.service.create(CREATE);
    h.runner.last.finish();
    await settle();
    await assert.rejects(h.service.resume('task-1', '続き'), /session/);
  });

  test('削除すると、実行中なら止めてから保存先から消す', async () => {
    const h = harness();
    await h.service.create(CREATE);
    await h.service.delete('task-1');
    assert.strictEqual(h.runner.last.interrupted, true);
    assert.strictEqual(await h.store.load('task-1'), undefined);
    assert.deepStrictEqual(await h.service.list(), []);
  });

  test('無いタスクの操作はエラーになる', async () => {
    const h = harness();
    await assert.rejects(h.service.send('nope', 'x'), /not found/);
    await assert.rejects(h.service.stop('nope'), /not found/);
    await assert.rejects(h.service.resume('nope', 'x'), /not found/);
    await assert.rejects(h.service.delete('nope'), /not found/);
  });
});

suite('TaskService: 起動時の復旧', () => {
  test('保存先に実行中や入力待ちのまま残っているタスクは、中断に直す', async () => {
    const store = new InMemoryTaskStore();
    const stale = (id: string, status: TaskStatus): Task => ({
      id,
      title: id,
      status,
      cwd: 'D:\\work',
      permissionMode: 'default',
      alwaysAllowed: [],
      turns: [],
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-23T09:00:00.000Z',
    });
    await store.save(stale('a', 'running'));
    await store.save(stale('b', 'waiting'));
    await store.save(stale('c', 'done'));

    const service = new TaskService({
      runner: new FakeAgentRunner(),
      store,
      newId: () => 'x',
      now: () => '2026-09-23T10:00:00.000Z',
      approve: async () => ({ behavior: 'deny', message: 'test' }),
    });
    await service.recover();

    assert.strictEqual((await store.load('a'))?.status, 'interrupted');
    assert.strictEqual((await store.load('b'))?.status, 'interrupted');
    assert.strictEqual((await store.load('c'))?.status, 'done');
    assert.strictEqual((await store.load('a'))?.updatedAt, '2026-09-23T10:00:00.000Z');
  });
});
