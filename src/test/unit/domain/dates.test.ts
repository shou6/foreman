import * as assert from 'assert';
import { dayKindOf, formatDate, formatTime, sameLocalDay } from '../../../domain/time';

/** 手元の時刻（テストを動かす場所のタイムゾーン）で組み立てる */
const at = (y: number, m: number, d: number, h = 12, min = 0): string =>
  new Date(y, m - 1, d, h, min).toISOString();

suite('time: 日付と時刻の表し方', () => {
  test('同じ日かどうかは、手元の時刻の日付で比べる', () => {
    assert.strictEqual(sameLocalDay(at(2026, 9, 24, 0, 5), at(2026, 9, 24, 23, 55)), true);
    assert.strictEqual(sameLocalDay(at(2026, 9, 24, 23, 55), at(2026, 9, 25, 0, 5)), false);
  });

  test('今日・昨日・それより前を見分ける。月をまたいでも昨日は昨日', () => {
    const now = new Date(2026, 9 - 1, 25, 9, 0);
    assert.strictEqual(dayKindOf(at(2026, 9, 25, 0, 1), now), 'today');
    assert.strictEqual(dayKindOf(at(2026, 9, 24, 23, 59), now), 'yesterday');
    assert.strictEqual(dayKindOf(at(2026, 9, 23), now), 'other');
    assert.strictEqual(dayKindOf(at(2026, 9, 30), new Date(2026, 10 - 1, 1, 8)), 'yesterday');
  });

  test('日付は月・日・曜日。年が違えば年も付ける', () => {
    const now = new Date(2026, 9 - 1, 25, 9, 0);
    assert.strictEqual(formatDate(at(2026, 9, 24), 'ja', now), '9月24日(木)');
    assert.strictEqual(formatDate(at(2026, 9, 24), 'en-US', now), 'Thu, September 24');
    assert.strictEqual(
      formatDate(at(2026, 9, 24), 'ja', new Date(2027, 0, 5)),
      '2026年9月24日(木)'
    );
  });

  test('時刻は 24 時間制の時と分（2 桁）', () => {
    assert.strictEqual(formatTime(at(2026, 9, 25, 9, 5), 'ja'), '09:05');
    assert.strictEqual(formatTime(at(2026, 9, 25, 18, 12), 'en-US'), '18:12');
  });
});
