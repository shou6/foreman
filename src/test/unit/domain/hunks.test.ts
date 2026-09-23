import * as assert from 'assert';
import { hunksOf, type DiffLine } from '../../../domain/diff';

function same(n: number, prefix = 's'): DiffLine[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'same' as const,
    text: `${prefix}${i + 1}`,
  }));
}

suite('hunksOf', () => {
  test('変更の前後 3 行だけを残し、離れた変更は別の hunk にする', () => {
    const lines: DiffLine[] = [
      ...same(10, 'a'),
      { kind: 'add', text: 'ADD' },
      ...same(10, 'b'),
      { kind: 'del', text: 'DEL' },
      ...same(10, 'c'),
    ];
    const hunks = hunksOf(lines, 3);
    assert.strictEqual(hunks.length, 2);
    assert.deepStrictEqual(
      hunks[0]?.lines.map((l) => l.text),
      ['a8', 'a9', 'a10', 'ADD', 'b1', 'b2', 'b3']
    );
    assert.deepStrictEqual(hunks[0], {
      oldStart: 8,
      oldCount: 6,
      newStart: 8,
      newCount: 7,
      lines: hunks[0]?.lines,
    });
    assert.deepStrictEqual(
      hunks[1]?.lines.map((l) => l.text),
      ['b8', 'b9', 'b10', 'DEL', 'c1', 'c2', 'c3']
    );
    assert.strictEqual(hunks[1]?.oldStart, 18);
    assert.strictEqual(hunks[1]?.newStart, 19);
  });

  test('近い変更は 1 つの hunk にまとめる', () => {
    const lines: DiffLine[] = [
      ...same(5),
      { kind: 'add', text: 'A' },
      ...same(4, 'm'),
      { kind: 'add', text: 'B' },
      ...same(5, 'z'),
    ];
    const hunks = hunksOf(lines, 3);
    assert.strictEqual(hunks.length, 1);
    assert.strictEqual(hunks[0]?.lines.length, 3 + 1 + 4 + 1 + 3);
  });

  test('変更が無ければ hunk も無い。全部が変更なら全行', () => {
    assert.deepStrictEqual(hunksOf(same(5), 3), []);
    const all = hunksOf(
      [
        { kind: 'add', text: 'x' },
        { kind: 'add', text: 'y' },
      ],
      3
    );
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0]?.oldCount, 0);
    assert.strictEqual(all[0]?.newCount, 2);
    assert.strictEqual(all[0]?.oldStart, 1);
  });

  test('各行に行番号が付いている', () => {
    const hunks = hunksOf([...same(4), { kind: 'del', text: 'D' }, ...same(1, 'z')], 3);
    const first = hunks[0]?.lines[0];
    assert.strictEqual(first?.oldNo, 2);
    assert.strictEqual(first?.newNo, 2);
  });
});
