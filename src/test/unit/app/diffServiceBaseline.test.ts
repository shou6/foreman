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

suite('DiffService: 変更前を Git から補う', () => {
  test('監視で拾ったファイルの変更前が不明なら、baseline（HEAD の内容）を使う', async () => {
    const runner = new FakeAgentRunner();
    const store = new InMemoryTaskStore();
    const service = new TaskService({
      runner,
      store,
      newId: () => 'task-1',
      now: () => '2026-09-24T10:00:00.000Z',
      approve: async () => ({ behavior: 'allow' }),
    });
    const fs = new FakeFileSystem({ ['D:\\work\\package.json']: '{"a":1}\n' });
    const snapshots = new InMemorySnapshotStore();
    const asked: string[] = [];
    new DiffService({
      service,
      fs,
      snapshots,
      sep: '\\',
      baseline: async (_dir, path) => {
        asked.push(path);
        return path === 'package.json' ? '{"a":1}\n' : undefined;
      },
    });
    await service.create({ prompt: 'p', cwd: CWD });
    await settle();
    fs.change('D:\\work\\package.json', '{"a":1,"b":2}\n');
    fs.change('D:\\work\\new.txt', 'new\n');
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = (await store.load('task-1'))?.turns[0]?.changes ?? [];
    const pkg = changes.find((c) => c.path === 'package.json');
    assert.strictEqual(await snapshots.load(pkg?.before ?? ''), '{"a":1}\n');
    assert.strictEqual(pkg?.kind, 'modified');
    assert.strictEqual(pkg?.added, 1);
    assert.strictEqual(pkg?.removed, 1);
    assert.strictEqual(pkg?.source, 'watcher');
    const fresh = changes.find((c) => c.path === 'new.txt');
    assert.strictEqual(fresh?.before, undefined, 'HEAD に無いファイルは不明のまま');
    assert.deepStrictEqual(asked.sort(), ['new.txt', 'package.json']);
  });
});
