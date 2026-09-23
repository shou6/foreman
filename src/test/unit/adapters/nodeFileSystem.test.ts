import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeFileSystem } from '../../../adapters/nodeFileSystem';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-fs-'));
}

suite('NodeFileSystem', () => {
  test('読み書きと削除。無いファイルは undefined', async () => {
    const dir = tmp();
    const nfs = new NodeFileSystem();
    const file = path.join(dir, 'a.txt');
    assert.strictEqual(await nfs.readFile(file), undefined);
    await nfs.writeFile(file, 'hi\n');
    assert.strictEqual(await nfs.readFile(file), 'hi\n');
    await nfs.deleteFile(file);
    assert.strictEqual(await nfs.readFile(file), undefined);
    await nfs.deleteFile(file);
  });

  test('書き込み先のフォルダが無ければ作る', async () => {
    const dir = tmp();
    const nfs = new NodeFileSystem();
    const file = path.join(dir, 'sub', 'b.txt');
    await nfs.writeFile(file, 'x');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'x');
  });

  test('監視は、フォルダの下のファイルの変更を絶対パスで知らせる', async function () {
    this.timeout(10_000);
    const dir = tmp();
    const nfs = new NodeFileSystem();
    const seen: string[] = [];
    const stop = nfs.watch(dir, (p) => seen.push(p));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.writeFileSync(path.join(dir, 'c.txt'), 'c');
    for (let i = 0; i < 40 && seen.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    stop();
    assert.ok(
      seen.some((p) => path.resolve(p) === path.resolve(path.join(dir, 'c.txt'))),
      'seen: ' + JSON.stringify(seen)
    );
  });
});
