import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk' with {
  'resolution-mode': 'import',
};
import type { SdkModelInfo } from '../domain/models';
import type { ModelCatalog } from '../ports/modelCatalog';

/** query() のうち、モデルの一覧に使う分だけ。テストではフェイクに差し替える */
export type ModelQueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Pick<Query, 'supportedModels' | 'close'>;

export interface AgentSdkModelCatalogDeps {
  query: ModelQueryFn;
  /** ユーザーの claude CLI の場所。見つからなければ例外 */
  claudePath: () => string;
  cwd: () => string;
}

/**
 * 指示を送らずに claude を起動し、使えるモデルの一覧だけを聞いて閉じる。
 * モデルを呼ばないので、トークンや契約の枠は使わない（2026-09-25 に実機で約 1.5 秒）
 */
export class AgentSdkModelCatalog implements ModelCatalog {
  constructor(private readonly deps: AgentSdkModelCatalogDeps) {}

  async list(): Promise<SdkModelInfo[]> {
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
        // ユーザーの設定や hooks は読まない（一覧を聞くだけなので軽くする）
        settingSources: [],
      },
    });
    try {
      const models = await query.supportedModels();
      return models.map((m) => ({
        value: m.value,
        resolvedModel: m.resolvedModel,
        displayName: m.displayName,
        description: m.description,
        supportedEffortLevels: m.supportedEffortLevels,
      }));
    } finally {
      release();
      query.close();
    }
  }
}
