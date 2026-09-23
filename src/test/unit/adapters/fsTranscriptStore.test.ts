import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FsTranscriptStore } from '../../../adapters/fsTranscriptStore';
import type { TranscriptDelta } from '../../../app/transcripts';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-transcripts-'));
}

const DELTAS: TranscriptDelta[] = [
  { type: 'turn-start', turn: 0, prompt: 'p' },
  { type: 'event', turn: 0, event: { type: 'text', text: 'hi' } },
  { type: 'event', turn: 0, event: { type: 'turn-end', ok: true } },
];

suite('FsTranscriptStore', () => {
  test('追記した順に読み戻せる', async () => {
    const store = new FsTranscriptStore(tmp());
    for (const delta of DELTAS) {
      store.append('task-1', delta);
    }
    store.append('task-2', DELTAS[0]!);
    await store.flush();
    const all = await store.loadAll();
    assert.deepStrictEqual(all.get('task-1'), DELTAS);
    assert.deepStrictEqual(all.get('task-2'), [DELTAS[0]]);
  });

  test('別のインスタンスからも読める（再起動の再現）', async () => {
    const dir = tmp();
    const first = new FsTranscriptStore(dir);
    first.append('task-1', DELTAS[0]!);
    await first.flush();
    const second = new FsTranscriptStore(dir);
    assert.deepStrictEqual((await second.loadAll()).get('task-1'), [DELTAS[0]]);
  });

  test('壊れた行は飛ばす', async () => {
    const dir = tmp();
    const store = new FsTranscriptStore(dir);
    store.append('task-1', DELTAS[0]!);
    await store.flush();
    fs.appendFileSync(path.join(dir, 'task-1.jsonl'), '{broken\n');
    store.append('task-1', DELTAS[1]!);
    await store.flush();
    assert.deepStrictEqual((await store.loadAll()).get('task-1'), [DELTAS[0], DELTAS[1]]);
  });

  test('削除すると読めなくなる', async () => {
    const store = new FsTranscriptStore(tmp());
    store.append('task-1', DELTAS[0]!);
    await store.flush();
    await store.delete('task-1');
    assert.strictEqual((await store.loadAll()).get('task-1'), undefined);
  });

  test('フォルダが無くても空', async () => {
    const store = new FsTranscriptStore(path.join(tmp(), 'missing'));
    assert.deepStrictEqual(await store.loadAll(), new Map());
  });
});
