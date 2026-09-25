import * as assert from 'assert';
import {
  levelOf,
  normalizePlanUsageItems,
  PLAN_USAGE_ITEMS,
  planUsageEntries,
  rateLimitsFromSdk,
  untilReset,
} from '../../../domain/rateLimits';

const NOW = '2026-09-25T02:00:00.000Z';

suite('rateLimitsFromSdk', () => {
  test('5 時間枠・7 日枠・モデル別の使用率と回復の時刻を取り出す', () => {
    const limits = rateLimitsFromSdk(
      {
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 35, resets_at: '2026-09-25T02:09:59.811646+00:00' },
          seven_day: { utilization: 41, resets_at: '2026-09-25T21:59:59.811665+00:00' },
          model_scoped: [
            {
              display_name: 'Fable',
              utilization: 67,
              resets_at: '2026-09-25T22:00:00.186619+00:00',
            },
          ],
        },
      },
      NOW
    );
    assert.deepStrictEqual(limits, {
      fiveHour: { utilization: 35, resetsAt: '2026-09-25T02:09:59.811646+00:00' },
      sevenDay: { utilization: 41, resetsAt: '2026-09-25T21:59:59.811665+00:00' },
      models: [{ name: 'Fable', utilization: 67, resetsAt: '2026-09-25T22:00:00.186619+00:00' }],
      fetchedAt: NOW,
    });
  });

  test('契約の枠が無い（API キーなど）時や、値が欠けている時は undefined', () => {
    assert.strictEqual(
      rateLimitsFromSdk({ rate_limits_available: false, rate_limits: null }, NOW),
      undefined
    );
    assert.strictEqual(
      rateLimitsFromSdk({ rate_limits_available: true, rate_limits: {} }, NOW),
      undefined
    );
    assert.strictEqual(rateLimitsFromSdk(undefined, NOW), undefined);
  });

  test('使用率が null の窓は出さない。モデル別が無ければ空', () => {
    const limits = rateLimitsFromSdk(
      {
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 12, resets_at: null },
          seven_day: { utilization: null, resets_at: null },
        },
      },
      NOW
    );
    assert.deepStrictEqual(limits, {
      fiveHour: { utilization: 12, resetsAt: undefined },
      sevenDay: undefined,
      models: [],
      fetchedAt: NOW,
    });
  });
});

suite('untilReset', () => {
  test('回復までの分数。過ぎていれば 0、分からなければ undefined', () => {
    assert.strictEqual(untilReset('2026-09-25T04:15:30.000Z', NOW), 135);
    assert.strictEqual(untilReset('2026-09-25T01:00:00.000Z', NOW), 0);
    assert.strictEqual(untilReset(undefined, NOW), undefined);
    assert.strictEqual(untilReset('x', NOW), undefined);
  });
});

suite('levelOf', () => {
  test('70% 未満は low、90% 未満は mid、それ以上は high', () => {
    assert.strictEqual(levelOf(0), 'low');
    assert.strictEqual(levelOf(69), 'low');
    assert.strictEqual(levelOf(70), 'mid');
    assert.strictEqual(levelOf(90), 'high');
    assert.strictEqual(levelOf(100), 'high');
  });
});

suite('planUsageEntries: 設定で選んだ項目だけを、その順に並べる', () => {
  const limits = {
    fiveHour: { utilization: 22, resetsAt: undefined },
    sevenDay: { utilization: 45, resetsAt: undefined },
    models: [
      { name: 'Fable', utilization: 73, resetsAt: undefined },
      { name: 'Opus', utilization: 10, resetsAt: undefined },
    ],
    fetchedAt: NOW,
  };

  test('既定（すべて）は 5 時間枠、7 日枠、モデル別の順', () => {
    assert.deepStrictEqual(
      planUsageEntries(limits, PLAN_USAGE_ITEMS).map((e) => [e.kind, e.name, e.utilization]),
      [
        ['fiveHour', undefined, 22],
        ['sevenDay', undefined, 45],
        ['model', 'Fable', 73],
        ['model', 'Opus', 10],
      ]
    );
  });

  test('項目を絞れる。無い窓は飛ばす。空なら何も出さない', () => {
    assert.deepStrictEqual(
      planUsageEntries(limits, ['models', 'fiveHour']).map((e) => e.kind),
      ['model', 'model', 'fiveHour']
    );
    assert.deepStrictEqual(planUsageEntries({ ...limits, sevenDay: undefined }, ['sevenDay']), []);
    assert.deepStrictEqual(planUsageEntries(limits, []), []);
  });
});

suite('normalizePlanUsageItems: 設定の値を項目の一覧にする', () => {
  test('知らない値と重複は外す。配列でなければ既定（すべて）', () => {
    assert.deepStrictEqual(normalizePlanUsageItems(['sevenDay', 'x', 'sevenDay', 'models']), [
      'sevenDay',
      'models',
    ]);
    assert.deepStrictEqual(normalizePlanUsageItems(undefined), PLAN_USAGE_ITEMS);
    assert.deepStrictEqual(normalizePlanUsageItems('fiveHour'), PLAN_USAGE_ITEMS);
    assert.deepStrictEqual(normalizePlanUsageItems([]), []);
  });
});
