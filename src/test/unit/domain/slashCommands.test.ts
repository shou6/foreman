import * as assert from 'assert';
import { matchSlash, slashSuggestions } from '../../../domain/slashCommands';

const PRESETS = [
  { name: 'fix', prompt: 'Fix: {input}' },
  { name: 'review', prompt: 'Review: {input}' },
];
const COMMANDS = [
  {
    name: 'compact',
    description: 'Clear conversation history but keep a summary',
    argumentHint: '',
  },
  { name: 'review', description: 'Review a pull request', argumentHint: '<pr>' },
  { name: 'frontend-design', description: 'Design UI', argumentHint: '' },
];

suite('matchSlash: / の後の候補（プリセットと Claude Code のコマンド）', () => {
  test('前方一致で、プリセットを先に、その後にコマンドを並べる。同じ名前はプリセットが勝つ', () => {
    assert.deepStrictEqual(
      matchSlash('/re', PRESETS, COMMANDS).map((c) => [c.name, c.source]),
      [['review', 'preset']]
    );
    assert.deepStrictEqual(
      matchSlash('/', PRESETS, COMMANDS).map((c) => c.name),
      ['fix', 'review', 'compact', 'frontend-design']
    );
  });

  test('候補にはプリセットの本文の 1 行目、コマンドの説明と引数のヒントが付く', () => {
    assert.deepStrictEqual(matchSlash('/comp', PRESETS, COMMANDS), [
      {
        name: 'compact',
        source: 'command',
        description: 'Clear conversation history but keep a summary',
        argumentHint: '',
      },
    ]);
    assert.deepStrictEqual(matchSlash('/fi', PRESETS, COMMANDS)[0]?.description, 'Fix: {input}');
  });

  test('/ で始まらない、または空白を含めば候補を出さない', () => {
    assert.deepStrictEqual(matchSlash('fix', PRESETS, COMMANDS), []);
    assert.deepStrictEqual(matchSlash('/fix now', PRESETS, COMMANDS), []);
  });
});

suite('slashSuggestions: 入力欄に出す候補（絞り込みと上限）', () => {
  const presets = [{ name: 'fix', prompt: 'Fix: {input}' }];
  const commands = Array.from({ length: 30 }, (_, i) => ({
    name: `model-${i}`,
    description: `d${i}`,
    argumentHint: '',
  })).concat([
    {
      name: 'plugin:bio-research:chembl:compare_drugs',
      description: 'Compare drugs',
      argumentHint: '',
    },
  ]);

  test('/ だけならプリセットだけを出し、コマンドの件数を hidden で返す', () => {
    const s = slashSuggestions('/', presets, commands);
    assert.deepStrictEqual(
      s?.items.map((i) => i.name),
      ['fix']
    );
    assert.strictEqual(s?.hidden, 31);
  });

  test('1 文字以上で絞り、最大 10 件。あふれた分は hidden', () => {
    const s = slashSuggestions('/m', presets, commands);
    assert.strictEqual(s?.items.length, 10);
    assert.strictEqual(s?.hidden, 20);
    assert.strictEqual(s?.items[0]?.name, 'model-0');
  });

  test(': で区切った各部分でも前方一致する（plugin:… の長い名前を探せる）', () => {
    const s = slashSuggestions('/chem', presets, commands);
    assert.deepStrictEqual(
      s?.items.map((i) => i.name),
      ['plugin:bio-research:chembl:compare_drugs']
    );
  });

  test('候補を出さない時は undefined', () => {
    assert.strictEqual(slashSuggestions('hello', presets, commands), undefined);
    assert.strictEqual(slashSuggestions('/fix now', presets, commands), undefined);
  });
});
