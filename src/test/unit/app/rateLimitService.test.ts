import * as assert from 'assert';
import { RateLimitService } from '../../../app/rateLimitService';
import type { UsageSource } from '../../../ports/usageSource';

const RAW = {
  rate_limits_available: true,
  rate_limits: { five_hour: { utilization: 35, resets_at: null } },
};

function source(result: () => Promise<unknown>): UsageSource & { calls: number } {
  const s = {
    calls: 0,
    usage: async () => {
      s.calls++;
      return (await result()) as never;
    },
  };
  return s;
}

/** 時計を手で進めるための道具 */
function clock(): { now: () => string; advance: (ms: number) => void } {
  let t = Date.parse('2026-09-25T02:00:00.000Z');
  return { now: () => new Date(t).toISOString(), advance: (ms) => (t += ms) };
}

suite('RateLimitService', () => {
  test('取得すると利用枠が入り、変わったことを知らせる。取得する前は undefined', async () => {
    const c = clock();
    const service = new RateLimitService(
      source(async () => RAW),
      { now: c.now }
    );
    assert.strictEqual(service.current(), undefined);
    let changed = 0;
    service.onDidChange(() => changed++);
    await service.refresh();
    assert.strictEqual(service.current()?.fiveHour?.utilization, 35);
    assert.strictEqual(changed, 1);
  });

  test('契約の枠が無ければ undefined のまま', async () => {
    const service = new RateLimitService(
      source(async () => ({ rate_limits_available: false, rate_limits: null })),
      { now: clock().now }
    );
    await service.refresh();
    assert.strictEqual(service.current(), undefined);
  });

  test('取得に失敗しても前の値を残し、失敗は知らせるだけで例外にしない', async () => {
    const errors: unknown[] = [];
    let fail = false;
    const service = new RateLimitService(
      source(async () => {
        if (fail) {
          throw new Error('boom');
        }
        return RAW;
      }),
      { now: clock().now, onError: (e) => errors.push(e) }
    );
    await service.refresh();
    fail = true;
    await service.refresh();
    assert.strictEqual(service.current()?.fiveHour?.utilization, 35);
    assert.strictEqual(errors.length, 1);
  });

  test('ターンの終わりの取り直しは 1 分に 1 回まで。同時に呼んでも取得は 1 回', async () => {
    const c = clock();
    const s = source(async () => RAW);
    const service = new RateLimitService(s, { now: c.now });
    await Promise.all([service.refreshAfterTurn(), service.refreshAfterTurn()]);
    await service.refreshAfterTurn();
    assert.strictEqual(s.calls, 1);
    c.advance(61_000);
    await service.refreshAfterTurn();
    assert.strictEqual(s.calls, 2);
  });

  test('手で取り直す refresh は間隔に関係なく取得する', async () => {
    const c = clock();
    const s = source(async () => RAW);
    const service = new RateLimitService(s, { now: c.now });
    await service.refresh();
    await service.refresh();
    assert.strictEqual(s.calls, 2);
  });

  test('定期の取り直しを始めると、すぐに 1 回取り、10 分ごとに取り直す。2 回目の start は何もしない', async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const s = source(async () => RAW);
    const service = new RateLimitService(s, {
      now: clock().now,
      every: (fn, ms) => {
        timers.push({ fn, ms });
        return () => {};
      },
    });
    service.start();
    service.start();
    // 取得中の refresh は、その完了を待つだけ
    await service.refresh();
    assert.strictEqual(s.calls, 1);
    assert.deepStrictEqual(
      timers.map((t) => t.ms),
      [10 * 60_000]
    );
    timers[0].fn();
    await service.refresh();
    assert.strictEqual(s.calls, 2);
  });

  test('start する前は定期の取り直しをしない。dispose で止める', async () => {
    let scheduled = 0;
    let stopped = 0;
    const service = new RateLimitService(
      source(async () => RAW),
      {
        now: clock().now,
        every: () => {
          scheduled++;
          return () => stopped++;
        },
      }
    );
    assert.strictEqual(scheduled, 0);
    service.start();
    service.dispose();
    assert.strictEqual(stopped, 1);
  });
});
