import * as assert from 'assert';
import { answersToInput, questionsOf } from '../../../domain/question';
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
