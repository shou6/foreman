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

/** Windows のように、パスの大小を区別せずに読むファイルシステム */
class CaseInsensitiveFs extends FakeFileSystem {
  override async readFile(path: string): Promise<string | undefined> {
    const key = [...this.files.keys()].find((k) => k.toLowerCase() === path.toLowerCase());
    return key === undefined ? undefined : this.files.get(key);
  }
}

function setup(): { runner: FakeAgentRunner; store: InMemoryTaskStore; fs: CaseInsensitiveFs } {
  const runner = new FakeAgentRunner();
  const store = new InMemoryTaskStore();
  const service = new TaskService({
    runner,
    store,
    newId: () => 'task-1',
    now: () => '2026-09-26T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  const fs = new CaseInsensitiveFs({ ['D:\\work\\a.txt']: 'before\n' });
  new DiffService({ service, fs, snapshots: new InMemorySnapshotStore(), sep: '\\' });
  void service.create({ prompt: 'p', cwd: CWD });
  return { runner, store, fs };
}

/**
 * 編集ツールのパスと監視のパスは、同じファイルでも書き方が違うことがある。
 * VS Code の監視は Uri.fsPath を返すので、ドライブ文字が小文字になる（2026-09-26 に統合テストで確認）
 */
suite('DiffService: パスの書き方の違い', () => {
  test('ドライブ文字の大小だけが違うパスは同じファイルとして 1 件にまとめ、編集ツールの記録を使う', async () => {
    const { runner, store, fs } = setup();
    await settle();
    runner.last.emit({ type: 'file-edit', phase: 'before', path: 'D:\\work\\a.txt' });
    await settle();
    await fs.writeFile('D:\\work\\a.txt', 'before\nafter\n');
    fs.report('d:\\work\\a.txt');
    runner.last.emit({ type: 'file-edit', phase: 'after', path: 'D:\\work\\a.txt' });
    await settle();
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = (await store.load('task-1'))?.turns[0]?.changes ?? [];
    assert.deepStrictEqual(
      changes.map((c) => [c.path, c.kind, c.source, c.added, c.removed]),
      [['a.txt', 'modified', 'edit-tool', 1, 0]]
    );
  });

  test('監視が先に届いても、後から来た編集ツールの記録と 1 件にまとめる', async () => {
    const { runner, store, fs } = setup();
    await settle();
    fs.report('d:\\work\\a.txt');
    runner.last.emit({ type: 'file-edit', phase: 'before', path: 'D:\\work\\a.txt' });
    await settle();
    await fs.writeFile('D:\\work\\a.txt', 'before\nafter\n');
    runner.last.emit({ type: 'file-edit', phase: 'after', path: 'D:\\work\\a.txt' });
    await settle();
    runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = (await store.load('task-1'))?.turns[0]?.changes ?? [];
    assert.deepStrictEqual(
      changes.map((c) => [c.path, c.kind, c.source, c.added, c.removed]),
      [['a.txt', 'modified', 'edit-tool', 1, 0]]
    );
  });
});
