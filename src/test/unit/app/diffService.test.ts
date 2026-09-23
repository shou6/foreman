import * as assert from 'assert';
import { DiffService } from '../../../app/diffService';
import { TaskService } from '../../../app/taskService';
import { InMemoryTaskStore } from '../../../adapters/inMemoryTaskStore';
import type { FileChange } from '../../../domain/task';
import { FakeAgentRunner } from '../../support/fakes/fakeAgentRunner';
import { FakeFileSystem } from '../../support/fakes/fakeFileSystem';
import { InMemorySnapshotStore } from '../../support/fakes/inMemorySnapshotStore';

const CWD = 'D:\\work';
const A = 'D:\\work\\a.txt';
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

interface Harness {
  service: TaskService;
  runner: FakeAgentRunner;
  fs: FakeFileSystem;
  snapshots: InMemorySnapshotStore;
  diffs: DiffService;
  store: InMemoryTaskStore;
}

function harness(files: Record<string, string> = {}): Harness {
  const runner = new FakeAgentRunner();
  const store = new InMemoryTaskStore();
  const service = new TaskService({
    runner,
    store,
    newId: () => 'task-1',
    now: () => '2026-09-23T10:00:00.000Z',
    approve: async () => ({ behavior: 'allow' }),
  });
  const fs = new FakeFileSystem(files);
  const snapshots = new InMemorySnapshotStore();
  const diffs = new DiffService({ service, fs, snapshots, sep: '\\' });
  return { service, runner, fs, snapshots, diffs, store };
}

async function changesOf(h: Harness, turn = 0): Promise<FileChange[]> {
  return (await h.store.load('task-1'))?.turns[turn]?.changes ?? [];
}

suite('DiffService: 編集ツール', () => {
  test('編集の前後を保存し、ターンの終了で変更として記録する', async () => {
    const h = harness({ [A]: 'alpha\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, 'alpha\nedited\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();

    const before = await h.snapshots.save('alpha\n');
    const after = await h.snapshots.save('alpha\nedited\n');
    assert.deepStrictEqual(await changesOf(h), [
      {
        path: 'a.txt',
        kind: 'modified',
        before,
        after,
        source: 'edit-tool',
        reverted: false,
        added: 1,
        removed: 0,
      },
    ]);
  });

  test('無かったファイルへの書き込みは新規作成', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, 'new\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const [change] = await changesOf(h);
    assert.strictEqual(change?.kind, 'created');
    assert.strictEqual(change?.before, undefined);
    assert.strictEqual(change?.added, 1);
  });

  test('同じターンで何度も編集しても、最初の前と最後の後を残す', async () => {
    const h = harness({ [A]: '1\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    for (const next of ['2\n', '3\n']) {
      h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
      await settle();
      h.fs.change(A, next);
      h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
      await settle();
    }
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = await changesOf(h);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(await h.snapshots.load(changes[0]?.before ?? ''), '1\n');
    assert.strictEqual(await h.snapshots.load(changes[0]?.after ?? ''), '3\n');
  });

  test('前後が同じ内容なら変更として記録しない', async () => {
    const h = harness({ [A]: 'same\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.deepStrictEqual(await changesOf(h), []);
  });
});

suite('DiffService: 監視で拾った変更', () => {
  test('ターンの間は作業ディレクトリを監視し、終了で止める', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    await settle();
    assert.strictEqual(h.fs.active, 1);
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.strictEqual(h.fs.active, 0);
    await h.service.send('task-1', 'more');
    await settle();
    assert.strictEqual(h.fs.active, 1);
  });

  test('編集ツール以外の変更は、変更前が不明のまま記録する', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    await settle();
    h.fs.change('D:\\work\\c.txt', 'shell\n');
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const after = await h.snapshots.save('shell\n');
    assert.deepStrictEqual(await changesOf(h), [
      {
        path: 'c.txt',
        kind: 'modified',
        before: undefined,
        after,
        source: 'watcher',
        reverted: false,
        added: undefined,
        removed: undefined,
      },
    ]);
  });

  test('前のターンで変更後を保存したファイルなら、それを変更前に使う', async () => {
    const h = harness({ [A]: 'v1\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, 'v2\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();

    await h.service.send('task-1', 'more');
    await settle();
    h.fs.change(A, 'v3\n');
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const [change] = await changesOf(h, 1);
    assert.strictEqual(change?.source, 'watcher');
    assert.strictEqual(await h.snapshots.load(change?.before ?? ''), 'v2\n');
    assert.strictEqual(change?.added, 1);
    assert.strictEqual(change?.removed, 1);
  });

  test('監視で拾ったファイルが消えていれば削除', async () => {
    const h = harness({ [A]: 'v1\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, 'v2\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();

    await h.service.send('task-1', 'more');
    await settle();
    h.fs.change(A, undefined);
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const [change] = await changesOf(h, 1);
    assert.strictEqual(change?.kind, 'deleted');
    assert.strictEqual(change?.after, undefined);
  });

  test('node_modules と .git の中は無視する', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    await settle();
    h.fs.change('D:\\work\\node_modules\\x\\index.js', 'x');
    h.fs.change('D:\\work\\.git\\index', 'x');
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.deepStrictEqual(await changesOf(h), []);
  });

  test('編集ツールで拾ったファイルは、監視でも重複して記録しない', async () => {
    const h = harness({ [A]: '1\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, '2\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    const changes = await changesOf(h);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0]?.source, 'edit-tool');
  });
});

suite('DiffService: 戻す', () => {
  async function modified(): Promise<Harness> {
    const h = harness({ [A]: 'old\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, 'new\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    return h;
  }

  test('変更前の内容に書き戻し、戻したことを記録する', async () => {
    const h = await modified();
    await h.diffs.revert('task-1', 0, 'a.txt');
    assert.strictEqual(h.fs.files.get(A), 'old\n');
    assert.strictEqual((await changesOf(h))[0]?.reverted, true);
  });

  test('新規作成を戻すと削除する', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: A });
    await settle();
    h.fs.change(A, 'new\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: A });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await h.diffs.revert('task-1', 0, 'a.txt');
    assert.strictEqual(h.fs.files.has(A), false);
  });

  test('変更前が不明なものは戻せない', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    await settle();
    h.fs.change('D:\\work\\c.txt', 'shell\n');
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    await assert.rejects(h.diffs.revert('task-1', 0, 'c.txt'), /unknown/);
  });

  test('差分の行を取り出せる', async () => {
    const h = await modified();
    assert.deepStrictEqual(await h.diffs.diffOf('task-1', 0, 'a.txt'), {
      before: 'old\n',
      after: 'new\n',
      lines: [
        { kind: 'del', text: 'old' },
        { kind: 'add', text: 'new' },
      ],
    });
  });
});

suite('DiffService: パスの正規化', () => {
  test('Windows ではドライブ文字の大小が違っても、作業ディレクトリからの相対にする', async () => {
    const h = harness({ ['d:\\work\\a.txt']: 'x\n' });
    await h.service.create({ prompt: 'p', cwd: CWD });
    h.runner.last.emit({ type: 'file-edit', phase: 'before', path: 'd:\\work\\a.txt' });
    await settle();
    h.fs.change('d:\\work\\a.txt', 'y\n');
    h.runner.last.emit({ type: 'file-edit', phase: 'after', path: 'd:\\work\\a.txt' });
    await settle();
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.strictEqual((await changesOf(h))[0]?.path, 'a.txt');
  });
});

suite('DiffService: 一時ファイル', () => {
  test('ターン中に作られて消えた、変更前も不明なファイルは記録しない', async () => {
    const h = harness();
    await h.service.create({ prompt: 'p', cwd: CWD });
    await settle();
    h.fs.change('D:\\work\\README.md.tmp.1234', 'partial');
    h.fs.change('D:\\work\\README.md.tmp.1234', undefined);
    h.runner.last.emit({ type: 'turn-end', ok: true });
    await settle();
    assert.deepStrictEqual(await changesOf(h), []);
  });
});
