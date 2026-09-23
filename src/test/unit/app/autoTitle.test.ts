import * as assert from 'assert';
import { AutoTitle } from '../../../app/autoTitle';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function build(suggest: (prompt: string) => Promise<string | undefined>, enabled = true) {
  const runner = new FakeAgentRunner();
  const service = new TaskService({
    runner,
    store: new InMemoryTaskStore(),
    newId: () => 'task-1',
    now: () => '2026-09-24T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  const auto = new AutoTitle(service, { suggest, enabled: () => enabled });
  return { service, auto };
}

suite('AutoTitle', () => {
  test('タスクの作成後に短いタイトルを問い合わせ、返ってきたら差し替える', async () => {
    const asked: string[] = [];
    const { service, auto } = build(async (prompt) => {
      asked.push(prompt);
      return 'README に節を追加';
    });
    const task = await service.create({
      prompt: 'README にテスト用のメッセージを追記したい',
      cwd: 'D:\\w',
    });
    await auto.onCreated(task);
    await settle();
    assert.deepStrictEqual(asked, ['README にテスト用のメッセージを追記したい']);
    assert.strictEqual((await service.load('task-1'))?.title, 'README に節を追加');
  });

  test('ユーザーがタイトルを付けたタスクは触らない', async () => {
    const asked: string[] = [];
    const { service, auto } = build(async (prompt) => {
      asked.push(prompt);
      return 'x';
    });
    const task = await service.create({ prompt: 'p', cwd: 'D:\\w', title: '自分の名前' });
    await auto.onCreated(task, true);
    await settle();
    assert.deepStrictEqual(asked, []);
    assert.strictEqual((await service.load('task-1'))?.title, '自分の名前');
  });

  test('設定で無効なら問い合わせない', async () => {
    const asked: string[] = [];
    const { service, auto } = build(async (prompt) => {
      asked.push(prompt);
      return 'x';
    }, false);
    const task = await service.create({ prompt: 'p', cwd: 'D:\\w' });
    await auto.onCreated(task);
    assert.deepStrictEqual(asked, []);
  });

  test('返答が無い・失敗した時は元のタイトルのまま', async () => {
    const { service, auto } = build(async () => undefined);
    const task = await service.create({ prompt: 'keep me', cwd: 'D:\\w' });
    await auto.onCreated(task);
    await settle();
    assert.strictEqual((await service.load('task-1'))?.title, 'keep me');
    const failing = build(async () => {
      throw new Error('boom');
    });
    const t2 = await failing.service.create({ prompt: 'still me', cwd: 'D:\\w' });
    await failing.auto.onCreated(t2);
    await settle();
    assert.strictEqual((await failing.service.load('task-1'))?.title, 'still me');
  });
});
