import * as assert from 'assert';
import { matchSlash } from '../../../domain/slashCommands';

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
