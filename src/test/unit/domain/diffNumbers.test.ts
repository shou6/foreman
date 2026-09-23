import * as assert from 'assert';
import { numberLines } from '../../../domain/diff';

suite('numberLines', () => {
  test('変更前と変更後の行番号を付ける。追加は変更前が無く、削除は変更後が無い', () => {
    assert.deepStrictEqual(
      numberLines([
        { kind: 'same', text: 'a' },
        { kind: 'del', text: 'b' },
        { kind: 'add', text: 'B' },
        { kind: 'add', text: 'c' },
        { kind: 'same', text: 'd' },
      ]),
      [
        { kind: 'same', text: 'a', oldNo: 1, newNo: 1 },
        { kind: 'del', text: 'b', oldNo: 2, newNo: undefined },
        { kind: 'add', text: 'B', oldNo: undefined, newNo: 2 },
        { kind: 'add', text: 'c', oldNo: undefined, newNo: 3 },
        { kind: 'same', text: 'd', oldNo: 3, newNo: 4 },
      ]
    );
  });
});
