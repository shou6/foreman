import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { Transcripts } from '../../../app/transcripts';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import type { ImportedTurn } from '../../../domain/sessions';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function build(): { service: TaskService; runner: FakeAgentRunner; transcripts: Transcripts } {
  const runner = new FakeAgentRunner();
  const service = new TaskService({
    runner,
    store: new InMemoryTaskStore(),
    newId: () => 'task-1',
    now: () => '2026-09-25T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  return { service, runner, transcripts: new Transcripts(service) };
}

const HISTORY: ImportedTurn[] = [
  {
    prompt: 'fix README',
    startedAt: '2026-09-20T10:00:00.000Z',
    lastMessageUuid: 'a2',
    events: [
      { type: 'text', text: 'Sure' },
      { type: 'tool-call', id: 't1', name: 'Read', input: {} },
      { type: 'tool-result', id: 't1', ok: true, output: 'body' },
      { type: 'turn-end', ok: true },
    ],
  },
  {
    prompt: 'thanks',
    lastMessageUuid: 'a3',
    events: [
      { type: 'text', text: 'Welcome' },
      { type: 'turn-end', ok: true },
    ],
  },
];

suite('TaskService: セッションの取り込み', () => {
  test('セッションをタスクとして取り込む。Claude は起動せず、次の指示を待つ状態にする', async () => {
    const { service, runner } = build();
    const task = await service.importSession(
      { sessionId: 's1', title: 'From CLI', cwd: 'D:\\work' },
      HISTORY
    );
    assert.strictEqual(task.status, 'waiting');
    assert.strictEqual(task.sessionId, 's1');
    assert.strictEqual(task.title, 'From CLI');
    assert.strictEqual(task.cwd, 'D:\\work');
    assert.deepStrictEqual(
      task.turns.map((t) => ({
        prompt: t.prompt,
        startedAt: t.startedAt,
        ended: t.endedAt !== undefined,
        result: t.result,
        last: t.lastMessageUuid,
        changes: t.changes,
      })),
      [
        {
          prompt: 'fix README',
          startedAt: '2026-09-20T10:00:00.000Z',
          ended: true,
          result: { ok: true },
          last: 'a2',
          changes: [],
        },
        {
          prompt: 'thanks',
          startedAt: '2026-09-25T10:00:00.000Z',
          ended: true,
          result: { ok: true },
          last: 'a3',
          changes: [],
        },
      ]
    );
    assert.strictEqual(runner.starts.length + runner.resumes.length, 0, 'Claude は起動しない');
  });

  test('過去のやり取りは、ターンの順に履歴に並ぶ', async () => {
    const { service, transcripts } = build();
    await service.importSession({ sessionId: 's1', title: 'From CLI', cwd: 'D:\\work' }, HISTORY);
    await settle();
    assert.deepStrictEqual(transcripts.get('task-1'), [
      { kind: 'prompt', turn: 0, text: 'fix README' },
      { kind: 'text', turn: 0, text: 'Sure' },
      {
        kind: 'tool',
        turn: 0,
        id: 't1',
        name: 'Read',
        input: {},
        status: 'ok',
        output: 'body',
      },
      { kind: 'turn-end', turn: 0, ok: true },
      { kind: 'prompt', turn: 1, text: 'thanks' },
      { kind: 'text', turn: 1, text: 'Welcome' },
      { kind: 'turn-end', turn: 1, ok: true },
    ]);
  });

  test('取り込んだタスクに指示を送ると、同じセッションを再開する', async () => {
    const { service, runner } = build();
    await service.importSession({ sessionId: 's1', title: 'From CLI', cwd: 'D:\\work' }, HISTORY);
    await service.send('task-1', 'next');
    assert.strictEqual(runner.resumes[0]?.sessionId, 's1');
    assert.strictEqual((await service.load('task-1'))?.turns.length, 3);
  });

  test('同じセッションを 2 回は取り込まない。ターンが無いセッションも断る', async () => {
    const { service } = build();
    await service.importSession({ sessionId: 's1', title: 'A', cwd: 'D:\\work' }, HISTORY);
    await assert.rejects(
      service.importSession(
        { id: 'task-2', sessionId: 's1', title: 'B', cwd: 'D:\\work' },
        HISTORY
      ),
      /already/
    );
    await assert.rejects(
      service.importSession({ id: 'task-3', sessionId: 's2', title: 'C', cwd: 'D:\\work' }, []),
      /no prompts/
    );
  });
});
