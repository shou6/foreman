import * as assert from 'assert';
import { describeSuggestions } from '../../../domain/suggestions';

suite('describeSuggestions', () => {
  test('setMode の acceptEdits は「ファイルの編集を自動で許可」', () => {
    assert.deepStrictEqual(
      describeSuggestions([{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]),
      ['acceptEdits']
    );
  });

  test('addRules はツール名と内容を Bash(…) の形で並べる', () => {
    assert.deepStrictEqual(
      describeSuggestions([
        {
          type: 'addRules',
          behavior: 'allow',
          destination: 'session',
          rules: [
            { toolName: 'Bash', ruleContent: 'git add -A && git status' },
            { toolName: 'WebFetch' },
          ],
        },
      ]),
      ['Bash(git add -A && git status)', 'WebFetch']
    );
  });

  test('知らない形は JSON のまま。空なら空', () => {
    assert.deepStrictEqual(describeSuggestions([]), []);
    assert.deepStrictEqual(describeSuggestions([{ type: 'other', x: 1 }]), [
      '{"type":"other","x":1}',
    ]);
  });
});
