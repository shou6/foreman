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

suite('transcript: text-final（確定した出力で、ストリームの断片を置き換える）', () => {
  test('再試行などで断片が重なっても、確定した本文に置き換わる', () => {
    let items: TranscriptItem[] = startTurn([], 0, 'p');
    items = applyEvent(items, 0, { type: 'text', text: 'ok' });
    items = applyEvent(items, 0, { type: 'text', text: 'ok' });
    items = applyEvent(items, 0, { type: 'text-final', text: 'ok', streamed: 4 });
    assert.deepStrictEqual(items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'text', turn: 0, text: 'ok' },
    ]);
  });

  test('確定より前の（確定済みの）本文は残す', () => {
    let items: TranscriptItem[] = startTurn([], 0, 'p');
    items = applyEvent(items, 0, { type: 'text', text: 'first. ' });
    items = applyEvent(items, 0, { type: 'text-final', text: 'first. ', streamed: 7 });
    items = applyEvent(items, 0, { type: 'text', text: 'sec' });
    items = applyEvent(items, 0, { type: 'text', text: 'sec' });
    items = applyEvent(items, 0, { type: 'text-final', text: 'sec', streamed: 6 });
    assert.deepStrictEqual(items[1], { kind: 'text', turn: 0, text: 'first. sec' });
  });

  test('断片が届いていなければ、確定した本文をそのまま足す', () => {
    let items: TranscriptItem[] = startTurn([], 0, 'p');
    items = applyEvent(items, 0, { type: 'text-final', text: 'hello', streamed: 0 });
    assert.deepStrictEqual(items[1], { kind: 'text', turn: 0, text: 'hello' });
  });

  test('直前の項目が出力でなければ（ツールの後など）、新しい項目にする', () => {
    let items: TranscriptItem[] = startTurn([], 0, 'p');
    items = applyEvent(items, 0, { type: 'tool-call', id: 't1', name: 'Read', input: {} });
    items = applyEvent(items, 0, { type: 'text-final', text: 'after', streamed: 0 });
    assert.deepStrictEqual(items[2], { kind: 'text', turn: 0, text: 'after' });
  });
});

suite('applyEvent: effort', () => {
  test('effort のイベントは会話の履歴に出さない', () => {
    const items = [{ kind: 'prompt' as const, turn: 0, text: 'p' }];
    assert.deepStrictEqual(applyEvent(items, 0, { type: 'effort', effort: 'high' }), items);
  });
});

suite('applyEvent: thinking', () => {
  test('考えている途中の断片は、同じターンの直前の thinking につなぐ。出力を挟むと新しい項目', () => {
    let items: TranscriptItem[] = [{ kind: 'prompt', turn: 0, text: 'p' }];
    items = applyEvent(items, 0, { type: 'thinking', text: 'Let me ' });
    items = applyEvent(items, 0, { type: 'thinking', text: 'check' });
    items = applyEvent(items, 0, { type: 'text', text: 'Sure' });
    items = applyEvent(items, 0, { type: 'thinking', text: 'again' });
    assert.deepStrictEqual(items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'thinking', turn: 0, text: 'Let me check' },
      { kind: 'text', turn: 0, text: 'Sure' },
      { kind: 'thinking', turn: 0, text: 'again' },
    ]);
  });

  test('中身の無い断片（第三者のクライアントには文が渡らない）は、空の thinking を 1 つだけ残す', () => {
    let items: TranscriptItem[] = [{ kind: 'prompt', turn: 0, text: 'p' }];
    items = applyEvent(items, 0, { type: 'thinking', text: '' });
    items = applyEvent(items, 0, { type: 'thinking', text: '' });
    items = applyEvent(items, 0, { type: 'thinking', text: '' });
    assert.deepStrictEqual(items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'thinking', turn: 0, text: '' },
    ]);
  });
});

suite('applyEvent: compact', () => {
  test('圧縮は区切りの項目として残す', () => {
    const items = applyEvent([{ kind: 'prompt', turn: 0, text: 'p' }], 0, {
      type: 'compact',
      preTokens: 27596,
      postTokens: 2537,
    });
    assert.deepStrictEqual(items[1], {
      kind: 'compact',
      turn: 0,
      preTokens: 27596,
      postTokens: 2537,
    });
  });
});
