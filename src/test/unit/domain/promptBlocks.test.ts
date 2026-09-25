import * as assert from 'assert';
import { inlineCode, promptBlocks, stripPromptMarks } from '../../../domain/promptBlocks';

suite('promptBlocks: ユーザーの指示を、文・引用・コードブロックに分ける', () => {
  test('引用は連続する行を 1 つにまとめ、行頭の > と空白を外す', () => {
    assert.deepStrictEqual(promptBlocks('> a\n>b\n> c\n\nafter'), [
      { kind: 'quote', text: 'a\nb\nc' },
      { kind: 'text', text: '\nafter' },
    ]);
  });

  test('フェンスの言語名を lang に入れる。フェンスの中では > を解釈しない', () => {
    assert.deepStrictEqual(promptBlocks('before\n```ts\n> not quote\nconst a = 1;\n```\nafter'), [
      { kind: 'text', text: 'before' },
      { kind: 'code', text: '> not quote\nconst a = 1;', lang: 'ts' },
      { kind: 'text', text: 'after' },
    ]);
  });

  test('閉じていないフェンスは末尾までコードとして扱う。言語名が無ければ lang は undefined', () => {
    assert.deepStrictEqual(promptBlocks('```\nx\ny'), [
      { kind: 'code', text: 'x\ny', lang: undefined },
    ]);
  });

  test('引用と文が交互に来ても順を保つ。\\r\\n も扱う', () => {
    assert.deepStrictEqual(promptBlocks('a\r\n> q\r\nb'), [
      { kind: 'text', text: 'a' },
      { kind: 'quote', text: 'q' },
      { kind: 'text', text: 'b' },
    ]);
  });

  test('記法が無ければ全体が 1 つの文。空なら空', () => {
    assert.deepStrictEqual(promptBlocks('plain\ntext'), [{ kind: 'text', text: 'plain\ntext' }]);
    assert.deepStrictEqual(promptBlocks(''), []);
  });
});

suite('inlineCode: 文をインラインコードとそれ以外に分ける', () => {
  test('バッククォートで囲んだ部分を code にする。閉じていなければ文のまま', () => {
    assert.deepStrictEqual(inlineCode('run `npm test` now'), [
      { code: false, text: 'run ' },
      { code: true, text: 'npm test' },
      { code: false, text: ' now' },
    ]);
    assert.deepStrictEqual(inlineCode('a `b'), [{ code: false, text: 'a `b' }]);
    assert.deepStrictEqual(inlineCode('`x`'), [{ code: true, text: 'x' }]);
  });
});

suite('stripPromptMarks: 一覧のカードに出す要約用に記号を外す', () => {
  test('引用の > とフェンスの行を外し、コードの中身は残す', () => {
    assert.strictEqual(stripPromptMarks('> q\n```ts\ncode\n```\nafter `x`'), 'q\ncode\nafter x');
  });
});
