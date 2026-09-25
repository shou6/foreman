import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk' with {
  'resolution-mode': 'import',
};
import type { UsageSource } from '../ports/usageSource';

/** query() のうち、利用枠に使う分だけ。テストではフェイクに差し替える */
export type UsageQueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Pick<Query, 'close'> & {
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET?: (opts?: {
    skipBehaviors?: boolean;
  }) => Promise<unknown>;
};

export interface AgentSdkUsageDeps {
  query: UsageQueryFn;
  /** ユーザーの claude CLI の場所。見つからなければ例外 */
  claudePath: () => string;
  cwd: () => string;
}

/**
 * 指示を送らずに claude を起動し、契約の利用枠だけを聞いて閉じる。
 * モデルを呼ばないので、トークンや契約の枠は使わない（2026-09-25 に実機で約 2 秒）。
 * SDK の関数は名前のとおり実験中で、次の版で変わる可能性がある。無くなっていたら undefined を返す
 */
export class AgentSdkUsage implements UsageSource {
  constructor(private readonly deps: AgentSdkUsageDeps) {}

  async usage(): Promise<unknown> {
    const claudePath = this.deps.claudePath();
    let release: () => void = () => {};
    // 何も送らない入力。閉じる時に終わらせる
    const prompt = (async function* (): AsyncGenerator<SDKUserMessage> {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    })();
    const query = this.deps.query({
      prompt,
      options: {
        cwd: this.deps.cwd(),
        pathToClaudeCodeExecutable: claudePath,
        // ユーザーの設定や hooks は読まない（枠を聞くだけなので軽くする）
        settingSources: [],
      },
    });
    try {
      const fn = query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
      if (typeof fn !== 'function') {
        return undefined;
      }
      // 直近 7 日の履歴の走査（behaviors）は要らない
      return await fn.call(query, { skipBehaviors: true });
    } finally {
      release();
      query.close();
    }
  }
}
