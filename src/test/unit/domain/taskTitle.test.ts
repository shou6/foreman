import * as assert from 'assert';
import { titleFromPrompt } from '../../../domain/taskTitle';

suite('titleFromPrompt', () => {
  test('1 行の短い指示は、そのままタイトルになる', () => {
    assert.strictEqual(titleFromPrompt('テストを直して'), 'テストを直して');
  });

  test('前後の空白は落とす', () => {
    assert.strictEqual(titleFromPrompt('  テストを直して \n'), 'テストを直して');
  });

  test('複数行の指示は、最初の空でない行だけを使う', () => {
    assert.strictEqual(titleFromPrompt('\n\n1 行目\n2 行目'), '1 行目');
  });

  test('長い指示は 50 文字で切り、末尾に … を付ける', () => {
    const prompt = 'あ'.repeat(60);
    const title = titleFromPrompt(prompt);
    assert.strictEqual(title, 'あ'.repeat(50) + '…');
  });

  test('ちょうど 50 文字なら切らない', () => {
    const prompt = 'a'.repeat(50);
    assert.strictEqual(titleFromPrompt(prompt), prompt);
  });

  test('サロゲートペアの途中で切らない', () => {
    const prompt = '😀'.repeat(60);
    const title = titleFromPrompt(prompt);
    assert.strictEqual(title, '😀'.repeat(50) + '…');
  });

  test('空の指示からはタイトルを作れない（表示側で l10n の既定名を当てる）', () => {
    assert.strictEqual(titleFromPrompt(''), undefined);
    assert.strictEqual(titleFromPrompt('   \n  '), undefined);
  });
});
