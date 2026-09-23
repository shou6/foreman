import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FsSnapshotStore } from '../../../adapters/fsSnapshotStore';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-snap-'));
}

suite('FsSnapshotStore', () => {
  test('内容を sha256 の名前で保存し、読み戻せる', async () => {
    const dir = tmp();
    const store = new FsSnapshotStore(dir);
    const hash = await store.save('hello\n');
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(fs.existsSync(path.join(dir, hash)));
    assert.strictEqual(await store.load(hash), 'hello\n');
  });

  test('同じ内容は同じハッシュになり、1 つだけ持つ', async () => {
    const dir = tmp();
    const store = new FsSnapshotStore(dir);
    const a = await store.save('x');
    const b = await store.save('x');
    assert.strictEqual(a, b);
    assert.strictEqual(fs.readdirSync(dir).length, 1);
  });

  test('無いハッシュは undefined', async () => {
    const store = new FsSnapshotStore(tmp());
    assert.strictEqual(await store.load('0'.repeat(64)), undefined);
  });

  test('保存先のフォルダが無ければ作る', async () => {
    const dir = path.join(tmp(), 'nested', 'snapshots');
    const store = new FsSnapshotStore(dir);
    await store.save('y');
    assert.ok(fs.existsSync(dir));
  });
});

suite('FsSnapshotStore: 後片付け', () => {
  test('一覧と削除', async () => {
    const store = new FsSnapshotStore(tmp());
    const a = await store.save('a');
    const b = await store.save('b');
    assert.deepStrictEqual((await store.list()).sort(), [a, b].sort());
    await store.delete(a);
    assert.deepStrictEqual(await store.list(), [b]);
    await store.delete(a);
  });
});
