import * as assert from 'assert';
import {
  applyPreset,
  DEFAULT_PRESETS,
  matchPresets,
  normalizePresets,
  type Preset,
} from '../../../domain/presets';

const PRESETS: Preset[] = [
  { name: 'fix', prompt: 'Fix the following problem. Explain the root cause first.\n\n{input}' },
  { name: 'test', prompt: 'Write tests for: {input}' },
  { name: 'review', prompt: 'Review the changes.' },
];

suite('presets: 指示のプリセット', () => {
  test('先頭の /名前 をプリセットの本文に置き換え、残りを {input} に入れる', () => {
    assert.deepStrictEqual(applyPreset('/fix login fails on Safari', PRESETS), {
      prompt: 'Fix the following problem. Explain the root cause first.\n\nlogin fails on Safari',
      preset: 'fix',
    });
  });

  test('{input} が無いプリセットは、残りを後ろに足す。残りが無ければ本文だけ', () => {
    assert.deepStrictEqual(applyPreset('/review', PRESETS), {
      prompt: 'Review the changes.',
      preset: 'review',
    });
    assert.deepStrictEqual(applyPreset('/review  src/auth', PRESETS), {
      prompt: 'Review the changes.\n\nsrc/auth',
      preset: 'review',
    });
  });

  test('知らない名前や、/ で始まらない文はそのまま', () => {
    assert.deepStrictEqual(applyPreset('/nope x', PRESETS), {
      prompt: '/nope x',
      preset: undefined,
    });
    assert.deepStrictEqual(applyPreset('fix it', PRESETS), { prompt: 'fix it', preset: undefined });
  });

  test('名前の大小は区別しない。{input} が空なら空のまま入れる', () => {
    assert.strictEqual(applyPreset('/TEST', PRESETS).prompt, 'Write tests for: ');
  });

  test('候補: / の後の途中までの文字で前方一致。空白が入ったら候補を出さない', () => {
    assert.deepStrictEqual(
      matchPresets('/', PRESETS).map((p) => p.name),
      ['fix', 'test', 'review']
    );
    assert.deepStrictEqual(
      matchPresets('/te', PRESETS).map((p) => p.name),
      ['test']
    );
    assert.deepStrictEqual(matchPresets('/test x', PRESETS), []);
    assert.deepStrictEqual(matchPresets('hello', PRESETS), []);
  });

  test('設定から読む: 名前と本文の文字列だけを残し、名前は小文字にして重複は先勝ち', () => {
    assert.deepStrictEqual(
      normalizePresets([
        { name: 'Fix', prompt: 'a' },
        { name: 'fix', prompt: 'b' },
        { name: '', prompt: 'c' },
        { name: 'x', prompt: 3 },
        'junk',
      ]),
      [{ name: 'fix', prompt: 'a' }]
    );
  });

  test('既定のプリセットは fix / test / review', () => {
    assert.deepStrictEqual(
      DEFAULT_PRESETS.map((p) => p.name),
      ['fix', 'test', 'review']
    );
    for (const p of DEFAULT_PRESETS) {
      assert.ok(p.prompt.includes('{input}'), p.name);
    }
  });
});
