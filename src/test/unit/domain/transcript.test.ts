import * as assert from 'assert';
import { applyEvent, startTurn, type TranscriptItem } from '../../../domain/transcript';

suite('transcript', () => {
  test('ターンの開始で指示が並ぶ', () => {
    assert.deepStrictEqual(startTurn([], 0, 'README を直して'), [
      { kind: 'prompt', turn: 0, text: 'README を直して' },
    ]);
  });

  test('出力の断片は、同じターンの直前の出力につなぐ', () => {
    let items: TranscriptItem[] = startTurn([], 0, 'p');
    items = applyEvent(items, 0, { type: 'text', text: 'Hel' });
    items = applyEvent(items, 0, { type: 'text', text: 'lo' });
    assert.deepStrictEqual(items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'text', turn: 0, text: 'Hello' },
    ]);
  });

  test('ツールの呼び出しを挟むと、出力は新しい項目になる', () => {
    let items: TranscriptItem[] = startTurn([], 0, 'p');
    items = applyEvent(items, 0, { type: 'text', text: 'A' });
    items = applyEvent(items, 0, {
      type: 'tool-call',
      id: 't1',
      name: 'Read',
      input: { file_path: 'README.md' },
    });
    items = applyEvent(items, 0, { type: 'text', text: 'B' });
    assert.deepStrictEqual(items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'text', turn: 0, text: 'A' },
      {
        kind: 'tool',
        turn: 0,
        id: 't1',
        name: 'Read',
        input: { file_path: 'README.md' },
        status: 'running',
      },
      { kind: 'text', turn: 0, text: 'B' },
    ]);
  });

  test('ツールの結果は、同じ id の呼び出しの状態と出力を更新する', () => {
    let items: TranscriptItem[] = applyEvent([], 0, {
      type: 'tool-call',
      id: 't1',
      name: 'Bash',
      input: { command: 'ls' },
    });
    items = applyEvent(items, 0, { type: 'tool-result', id: 't1', ok: true, output: 'a.txt' });
    assert.deepStrictEqual(items, [
      {
        kind: 'tool',
        turn: 0,
        id: 't1',
        name: 'Bash',
        input: { command: 'ls' },
        status: 'ok',
        output: 'a.txt',
      },
    ]);
    items = applyEvent(items, 0, { type: 'tool-result', id: 't1', ok: false, output: 'boom' });
    assert.strictEqual(items[0]?.kind === 'tool' && items[0].status, 'error');
  });

  test('知らない id のツールの結果は無視する', () => {
    assert.deepStrictEqual(
      applyEvent([], 0, { type: 'tool-result', id: 'x', ok: true, output: '' }),
      []
    );
  });

  test('ターンの終了は結果を残す', () => {
    assert.deepStrictEqual(applyEvent([], 0, { type: 'turn-end', ok: true }), [
      { kind: 'turn-end', turn: 0, ok: true },
    ]);
    assert.deepStrictEqual(
      applyEvent([], 0, { type: 'turn-end', ok: false, interrupted: true, reason: 'stopped' }),
      [{ kind: 'turn-end', turn: 0, ok: false, interrupted: true, reason: 'stopped' }]
    );
  });

  test('init と file-edit は表示に出さない', () => {
    assert.deepStrictEqual(applyEvent([], 0, { type: 'init', sessionId: 's', model: 'm' }), []);
    assert.deepStrictEqual(
      applyEvent([], 0, { type: 'file-edit', phase: 'before', path: 'a.txt' }),
      []
    );
  });

  test('元の配列は変えない', () => {
    const items: TranscriptItem[] = [];
    applyEvent(items, 0, { type: 'text', text: 'x' });
    assert.deepStrictEqual(items, []);
  });
});
