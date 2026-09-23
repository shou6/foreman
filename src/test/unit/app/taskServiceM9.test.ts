import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function build(): { runner: FakeAgentRunner; service: TaskService } {
  const runner = new FakeAgentRunner();
  let n = 0;
  const service = new TaskService({
    runner,
    store: new InMemoryTaskStore(),
    newId: () => `task-${++n}`,
    now: () => '2026-09-24T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  return { runner, service };
}

/** 2 ターン終わったタスクを作る。各ターンの最後のメッセージの uuid は u0, u1 */
async function twoTurns(h: { runner: FakeAgentRunner; service: TaskService }): Promise<void> {
  await h.service.create({ prompt: 'first', cwd: 'D:\\w' });
  h.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'm' });
  h.runner.last.emit({ type: 'turn-end', ok: true, lastMessageUuid: 'u0' });
  await settle();
  await h.service.send('task-1', 'second');
  h.runner.last.emit({ type: 'turn-end', ok: true, lastMessageUuid: 'u1' });
  await settle();
}

suite('TaskService: チェックポイント', () => {
  test('ターンの終了で、最後のメッセージの uuid をターンに残す', async () => {
    const h = build();
    await twoTurns(h);
    const task = await h.service.load('task-1');
    assert.strictEqual(task?.turns[0]?.lastMessageUuid, 'u0');
    assert.strictEqual(task?.turns[1]?.lastMessageUuid, 'u1');
  });

  test('会話を指定のターンまで戻すと、ターンが切り詰められ、次の指示はそこから分岐したセッションで続く', async () => {
    const h = build();
    await twoTurns(h);
    await h.service.rewindConversation('task-1', 0);
    let task = await h.service.load('task-1');
    assert.strictEqual(task?.turns.length, 1);
    assert.strictEqual(task?.status, 'waiting', '次の指示を待つ');
    assert.strictEqual(h.runner.last.closed, true, '動いていたセッションは閉じる');

    await h.service.send('task-1', 'third');
    const resumed = h.runner.resumes[h.runner.resumes.length - 1];
    assert.strictEqual(resumed?.sessionId, 'sess-1');
    assert.strictEqual(resumed?.handle.options.resumeAt, 'u0');
    assert.strictEqual(resumed?.handle.options.fork, true);
    h.runner.last.emit({ type: 'init', sessionId: 'sess-2', model: 'm' });
    await settle();
    task = await h.service.load('task-1');
    assert.strictEqual(task?.sessionId, 'sess-2', '分岐した新しいセッションに乗り換える');
    assert.strictEqual(task?.resumeAt, undefined, '一度使ったら消す');
  });

  test('実行中のタスクの会話は戻せない', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    await assert.rejects(h.service.rewindConversation('task-1', 0), /running/);
  });
});

suite('TaskService.fork', () => {
  test('親のセッションから分岐した新しいタスクを作る', async () => {
    const h = build();
    await twoTurns(h);
    const child = await h.service.fork('task-1', { prompt: 'go on', cwd: 'D:\\w' });
    assert.strictEqual(child.id, 'task-2');
    assert.strictEqual(child.parentTaskId, 'task-1');
    assert.strictEqual(child.status, 'running');
    assert.strictEqual(child.turns[0]?.prompt, 'go on');
    const resumed = h.runner.resumes[h.runner.resumes.length - 1];
    assert.strictEqual(resumed?.sessionId, 'sess-1');
    assert.strictEqual(resumed?.handle.options.fork, true);
    assert.strictEqual(resumed?.handle.options.resumeAt, undefined);
    h.runner.last.emit({ type: 'init', sessionId: 'sess-child', model: 'm' });
    await settle();
    assert.strictEqual((await h.service.load('task-2'))?.sessionId, 'sess-child');
    assert.strictEqual((await h.service.load('task-1'))?.sessionId, 'sess-1', '親は変わらない');
  });

  test('チェックポイントを指定すると、そのターンの直後から分岐する', async () => {
    const h = build();
    await twoTurns(h);
    await h.service.fork('task-1', { prompt: 'go on', cwd: 'D:\\w', fromTurn: 0 });
    const resumed = h.runner.resumes[h.runner.resumes.length - 1];
    assert.strictEqual(resumed?.handle.options.resumeAt, 'u0');
  });

  test('セッションの無い親からは切り出せない', async () => {
    const h = build();
    await h.service.create({ prompt: 'p', cwd: 'D:\\w' });
    await assert.rejects(h.service.fork('task-1', { prompt: 'x', cwd: 'D:\\w' }), /session/);
  });
});
