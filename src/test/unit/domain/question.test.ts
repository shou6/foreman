import * as assert from 'assert';
import {
  answersToInput,
  nextTabAfterChoice,
  optionKeyOf,
  questionsOf,
  withOther,
} from '../../../domain/question';
import type { PermissionRequest } from '../../../domain/events';

const ASK: PermissionRequest = {
  toolName: 'AskUserQuestion',
  input: {
    questions: [
      {
        question: 'Which section?',
        header: 'Section',
        multiSelect: false,
        options: [
          { label: 'Usage', description: 'Add to Usage' },
          { label: 'New', description: 'Create a new section' },
        ],
      },
      {
        question: 'Which files?',
        header: 'Files',
        multiSelect: true,
        options: [
          { label: 'README.md', description: '' },
          { label: 'README.ja.md', description: '' },
        ],
      },
    ],
  },
  suggestions: [],
};

suite('questionsOf', () => {
  test('AskUserQuestion の入力から質問と選択肢を取り出す', () => {
    assert.deepStrictEqual(questionsOf(ASK), [
      {
        question: 'Which section?',
        header: 'Section',
        multiSelect: false,
        options: [
          { label: 'Usage', description: 'Add to Usage' },
          { label: 'New', description: 'Create a new section' },
        ],
      },
      {
        question: 'Which files?',
        header: 'Files',
        multiSelect: true,
        options: [
          { label: 'README.md', description: '' },
          { label: 'README.ja.md', description: '' },
        ],
      },
    ]);
  });

  test('ほかのツールや、形が合わない入力は undefined', () => {
    assert.strictEqual(questionsOf({ toolName: 'Edit', input: {}, suggestions: [] }), undefined);
    assert.strictEqual(
      questionsOf({ toolName: 'AskUserQuestion', input: { questions: 'x' }, suggestions: [] }),
      undefined
    );
  });
});

suite('answersToInput', () => {
  test('答えを question をキーにして入力へ足す。複数選択は ", " でつなぐ', () => {
    assert.deepStrictEqual(
      answersToInput(ASK.input, [
        { question: 'Which section?', selected: ['Usage'] },
        { question: 'Which files?', selected: ['README.md', 'README.ja.md'] },
      ]),
      {
        ...ASK.input,
        answers: { 'Which section?': 'Usage', 'Which files?': 'README.md, README.ja.md' },
      }
    );
  });
});

suite('optionKeyOf', () => {
  test('1 始まりの数字キーを選択肢の番号（0 始まり）にする。最後の 1 つは「その他」', () => {
    assert.strictEqual(optionKeyOf('1', 3), 0);
    assert.strictEqual(optionKeyOf('3', 3), 2);
    assert.strictEqual(optionKeyOf('4', 3), 3, '選択肢が 3 つなら 4 は「その他」');
  });

  test('範囲の外や数字でないキーは undefined', () => {
    assert.strictEqual(optionKeyOf('5', 3), undefined);
    assert.strictEqual(optionKeyOf('0', 3), undefined);
    assert.strictEqual(optionKeyOf('a', 3), undefined);
    assert.strictEqual(optionKeyOf('Enter', 3), undefined);
  });
});

suite('withOther', () => {
  test('「その他」に書いた文を、選んだ選択肢の後ろに足す。空なら足さない', () => {
    assert.deepStrictEqual(withOther(['Usage'], undefined), ['Usage']);
    assert.deepStrictEqual(withOther([], '  自分で書く  '), ['自分で書く']);
    assert.deepStrictEqual(withOther(['README.md'], 'CHANGELOG.md'), ['README.md', 'CHANGELOG.md']);
    assert.deepStrictEqual(withOther(['Usage'], '   '), ['Usage']);
  });
});

suite('nextTabAfterChoice', () => {
  test('単一選択の選択肢を選ぶと次のタブへ進む。最後の質問の次は確認のタブ（質問の数）', () => {
    assert.strictEqual(nextTabAfterChoice({ multiSelect: false, other: false }, 0, 3), 1);
    assert.strictEqual(nextTabAfterChoice({ multiSelect: false, other: false }, 2, 3), 3);
  });

  test('複数選択と「その他」は続けて選んだり書いたりするので進めない', () => {
    assert.strictEqual(nextTabAfterChoice({ multiSelect: true, other: false }, 0, 3), 0);
    assert.strictEqual(nextTabAfterChoice({ multiSelect: false, other: true }, 1, 3), 1);
  });
});
