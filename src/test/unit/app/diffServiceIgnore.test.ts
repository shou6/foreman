import * as assert from 'assert';
import { DiffService } from '../../../app/diffService';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { FakeFileSystem } from '../../support/fakes/fakeFileSystem';
import { InMemorySnapshotStore } from '../../support/fakes/inMemorySnapshotStore';

const CWD = 'D:\\work';
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

suite('DiffService: 無視するファイル', () => {
  test('監視で拾ったファイルのうち、isIgnored が true にしたものは記録しない', async () => {
    const runner = new FakeAgentRunner();
    const store = new InMemoryTaskStore();
    const service = new TaskService({
      runner,
      store,
      newId: () => 'task-1',
      now: () => '2026-09-24T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    const fs = new FakeFileSystem();
    const asked: string[][] = [];
    new DiffService({
      service,
      fs,
      snapshots: new InMemorySnapshotStore(),
      sep: '\\',
      isIgnored: async (dir, paths) => {
        asked.push([dir, ...paths]);
        return paths.filter((p) => p.startsWith('out\\'));
      },
    });
    await service.create({ prompt: 'p', cwd: CWD });
    await settle();
    fs.change('D:\\work\\out\\a.js', 'built');
    fs.change('D:\\work\\src\\a.ts', 'source');
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = (await store.load('task-1'))?.turns[0]?.changes ?? [];
    assert.deepStrictEqual(
      changes.map((c) => c.path),
      ['src\\a.ts']
    );
    assert.deepStrictEqual(asked, [[CWD, 'out\\a.js', 'src\\a.ts']]);
  });

  test('編集ツールで変えたファイルは、無視の対象でも記録する', async () => {
    const runner = new FakeAgentRunner();
    const store = new InMemoryTaskStore();
    const service = new TaskService({
      runner,
      store,
      newId: () => 'task-1',
      now: () => '2026-09-24T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    const fs = new FakeFileSystem({ ['D:\\work\\out\\a.js']: 'x' });
    new DiffService({
      service,
      fs,
      snapshots: new InMemorySnapshotStore(),
      sep: '\\',
      isIgnored: async (_dir, paths) => paths,
    });
    await service.create({ prompt: 'p', cwd: CWD });
    runner.last.emit({ type: 'file-edit', phase: 'before', path: 'D:\\work\\out\\a.js' });
    await settle();
    fs.change('D:\\work\\out\\a.js', 'y');
    runner.last.emit({ type: 'file-edit', phase: 'after', path: 'D:\\work\\out\\a.js' });
    await settle();
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = (await store.load('task-1'))?.turns[0]?.changes ?? [];
    assert.strictEqual(changes.length, 1);
  });
});
