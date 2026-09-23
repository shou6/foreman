import * as assert from 'assert';
import { countChanges, lineDiff } from '../../../domain/diff';

suite('lineDiff', () => {
  test('変わらない行、足した行、消した行を並べる', () => {
    assert.deepStrictEqual(lineDiff('a\nb\nc\n', 'a\nB\nc\nd\n'), [
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
  });

  test('変更前が無い（新規作成）なら全行が追加', () => {
    assert.deepStrictEqual(lineDiff(undefined, 'x\ny\n'), [
      { kind: 'add', text: 'x' },
      { kind: 'add', text: 'y' },
    ]);
  });

  test('変更後が無い（削除）なら全行が削除', () => {
    assert.deepStrictEqual(lineDiff('x\n', undefined), [{ kind: 'del', text: 'x' }]);
  });

  test('同じ内容なら差分は無い', () => {
    assert.deepStrictEqual(countChanges(lineDiff('a\n', 'a\n')), { added: 0, removed: 0 });
  });

  test('末尾に改行が無いファイルも行として数える', () => {
    assert.deepStrictEqual(lineDiff('a', 'a\nb'), [
      { kind: 'same', text: 'a' },
      { kind: 'add', text: 'b' },
    ]);
  });
});

suite('countChanges', () => {
  test('追加と削除の行数を数える', () => {
    assert.deepStrictEqual(countChanges(lineDiff('a\nb\nc\n', 'a\nB\nc\nd\n')), {
      added: 2,
      removed: 1,
    });
  });
});
