import * as assert from 'assert';
import { TaskService } from '../../../app/taskService';
import { Transcripts, type TranscriptDelta } from '../../../app/transcripts';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function build(): { service: TaskService; runner: FakeAgentRunner; transcripts: Transcripts } {
  const runner = new FakeAgentRunner();
  const service = new TaskService({
    runner,
    store: new InMemoryTaskStore(),
    newId: () => 'task-1',
    now: () => '2026-09-23T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  return { service, runner, transcripts: new Transcripts(service) };
}

suite('Transcripts', () => {
  test('タスクの作成で指示が並び、Runner の出力がつながる', async () => {
    const { service, runner, transcripts } = build();
    await service.create({ prompt: 'README を直して', cwd: 'D:\\work' });
    runner.last.emit({ type: 'text', text: 'Sure' });
    runner.last.emit({ type: 'text', text: '!' });
    await settle();
    assert.deepStrictEqual(transcripts.get('task-1'), [
      { kind: 'prompt', turn: 0, text: 'README を直して' },
      { kind: 'text', turn: 0, text: 'Sure!' },
    ]);
  });

  test('追加の指示は次のターンの指示として並ぶ', async () => {
    const { service, runner, transcripts } = build();
    await service.create({ prompt: 'first', cwd: 'D:\\work' });
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await service.send('task-1', 'second');
    assert.deepStrictEqual(transcripts.get('task-1'), [
      { kind: 'prompt', turn: 0, text: 'first' },
      { kind: 'turn-end', turn: 0, ok: true },
      { kind: 'prompt', turn: 1, text: 'second' },
    ]);
  });

  test('知らないタスクは空', () => {
    assert.deepStrictEqual(build().transcripts.get('nope'), []);
  });

  test('追加された分を差分として伝える', async () => {
    const { service, runner, transcripts } = build();
    const deltas: { taskId: string; delta: TranscriptDelta }[] = [];
    transcripts.onDidAppend((taskId, delta) => deltas.push({ taskId, delta }));
    await service.create({ prompt: 'p', cwd: 'D:\\work' });
    runner.last.emit({ type: 'text', text: 'x' });
    await settle();
    assert.deepStrictEqual(deltas, [
      { taskId: 'task-1', delta: { type: 'turn-start', turn: 0, prompt: 'p' } },
      { taskId: 'task-1', delta: { type: 'event', turn: 0, event: { type: 'text', text: 'x' } } },
    ]);
  });

  test('削除したタスクの履歴は消える', async () => {
    const { service, transcripts } = build();
    await service.create({ prompt: 'p', cwd: 'D:\\work' });
    await service.delete('task-1');
    await settle();
    assert.deepStrictEqual(transcripts.get('task-1'), []);
  });
});
