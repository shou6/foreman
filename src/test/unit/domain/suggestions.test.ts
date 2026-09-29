import * as assert from 'assert';
import { broadenSuggestions, describeSuggestions } from '../../../domain/suggestions';

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

suite('broadenSuggestions', () => {
  const bash = (...contents: string[]) => [
    {
      type: 'addRules',
      behavior: 'allow',
      destination: 'session',
      rules: contents.map((ruleContent) => ({ toolName: 'Bash', ruleContent })),
    },
  ];

  test('Bash はコマンド名とサブコマンドまでの接頭辞に広げる', () => {
    assert.deepStrictEqual(
      broadenSuggestions(
        bash(
          "git commit -q -m 'test(editor): 土台 *",
          'npm test *',
          'git check-ignore *',
          'npm run compile'
        )
      ),
      bash('git commit *', 'npm test *', 'git check-ignore *', 'npm run *')
    );
  });

  test('2 語目がオプションやパスなら、コマンド名だけにする', () => {
    assert.deepStrictEqual(
      broadenSuggestions(bash('python -', 'node /tmp/addl10n.js {"a":"b"}', 'ls', 'npm:*')),
      bash('python *', 'node *', 'ls *', 'npm *')
    );
  });

  test('広げて同じになった規則は 1 つにまとめる', () => {
    assert.deepStrictEqual(
      broadenSuggestions(bash("git commit -m 'a'", "git commit -m 'b'")),
      bash('git commit *')
    );
  });

  test('複数のコマンドをつなぐものや環境変数の指定付きは、そのまま', () => {
    const kept = bash('git add -A && git status', 'cat a | grep b', 'FOO=1 npm test', 'a; b');
    assert.deepStrictEqual(broadenSuggestions(kept), kept);
  });

  test('Bash 以外や setMode はそのまま', () => {
    const others = [
      { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      {
        type: 'addRules',
        behavior: 'allow',
        destination: 'session',
        rules: [{ toolName: 'WebFetch', ruleContent: 'domain:example.com' }, { toolName: 'Bash' }],
      },
    ];
    assert.deepStrictEqual(broadenSuggestions(others), others);
  });
});
