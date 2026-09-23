import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FsTaskStore } from '../../../adapters/fsTaskStore';
import type { Task } from '../../../domain/task';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-tasks-'));
}

function task(id: string): Task {
  return {
    id,
    title: 'T ' + id,
    status: 'done',
    cwd: 'D:\\work',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [
      {
        index: 0,
        prompt: 'p',
        attachments: [],
        startedAt: '2026-09-23T10:00:00.000Z',
        changes: [],
      },
    ],
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
  };
}

suite('FsTaskStore', () => {
  test('保存したタスクを読み戻し、一覧に出る', async () => {
    const store = new FsTaskStore(tmp());
    await store.save(task('a'));
    await store.save(task('b'));
    assert.deepStrictEqual(await store.load('a'), task('a'));
    assert.deepStrictEqual((await store.list()).map((t) => t.id).sort(), ['a', 'b']);
  });

  test('無いタスクは undefined。削除すると一覧から消える', async () => {
    const store = new FsTaskStore(tmp());
    assert.strictEqual(await store.load('nope'), undefined);
    await store.save(task('a'));
    await store.delete('a');
    assert.strictEqual(await store.load('a'), undefined);
    assert.deepStrictEqual(await store.list(), []);
    await store.delete('a');
  });

  test('保存は上書きし、一時ファイルを残さない', async () => {
    const dir = tmp();
    const store = new FsTaskStore(dir);
    await store.save(task('a'));
    await store.save({ ...task('a'), title: 'renamed' });
    assert.strictEqual((await store.load('a'))?.title, 'renamed');
    assert.deepStrictEqual(fs.readdirSync(dir), ['a.json']);
  });

  test('壊れたファイルは一覧から外す', async () => {
    const dir = tmp();
    const store = new FsTaskStore(dir);
    await store.save(task('a'));
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
    assert.deepStrictEqual(
      (await store.list()).map((t) => t.id),
      ['a']
    );
  });

  test('フォルダが無くても一覧は空', async () => {
    const store = new FsTaskStore(path.join(tmp(), 'missing'));
    assert.deepStrictEqual(await store.list(), []);
  });
});
