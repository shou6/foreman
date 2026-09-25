import * as assert from 'assert';
import { AgentSdkUsage, type UsageQueryFn } from '../../../adapters/agentSdkUsage';

const RAW = { rate_limits_available: true, rate_limits: { five_hour: { utilization: 1 } } };

suite('AgentSdkUsage', () => {
  test('指示を送らずに claude を起動し、実験中の usage を聞いて閉じる', async () => {
    const calls: Record<string, unknown>[] = [];
    let closed = false;
    const query: UsageQueryFn = (params) => {
      calls.push(params.options as Record<string, unknown>);
      return {
        usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async (opts?: {
          skipBehaviors?: boolean;
        }) => {
          calls.push({ skipBehaviors: opts?.skipBehaviors });
          return RAW;
        },
        close: () => {
          closed = true;
        },
      } as never;
    };
    const usage = new AgentSdkUsage({ query, claudePath: () => 'c', cwd: () => 'd' });
    assert.deepStrictEqual(await usage.usage(), RAW);
    assert.strictEqual(calls[0]?.pathToClaudeCodeExecutable, 'c');
    assert.strictEqual(calls[1]?.skipBehaviors, true, '履歴の走査は要らない');
    assert.strictEqual(closed, true);
  });

  test('SDK にその関数が無ければ（名前が変わった時）、undefined を返して閉じる', async () => {
    let closed = false;
    const query: UsageQueryFn = () =>
      ({
        close: () => {
          closed = true;
        },
      }) as never;
    const usage = new AgentSdkUsage({ query, claudePath: () => 'c', cwd: () => 'd' });
    assert.strictEqual(await usage.usage(), undefined);
    assert.strictEqual(closed, true);
  });

  test('失敗してもプロセスは閉じ、例外を伝える', async () => {
    let closed = false;
    const query: UsageQueryFn = () =>
      ({
        usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => {
          throw new Error('boom');
        },
        close: () => {
          closed = true;
        },
      }) as never;
    const usage = new AgentSdkUsage({ query, claudePath: () => 'c', cwd: () => 'd' });
    await assert.rejects(usage.usage(), /boom/);
    assert.strictEqual(closed, true);
  });
});
