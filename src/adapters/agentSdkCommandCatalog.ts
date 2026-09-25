import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk' with {
  'resolution-mode': 'import',
};
import type { SlashCommandInfo } from '../domain/slashCommands';
import type { CommandCatalog } from '../ports/commandCatalog';

/** query() のうち、コマンドの一覧に使う分だけ。テストではフェイクに差し替える */
export type CommandQueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Pick<Query, 'supportedCommands' | 'close'>;

export interface AgentSdkCommandCatalogDeps {
  query: CommandQueryFn;
  /** ユーザーの claude CLI の場所。見つからなければ例外 */
  claudePath: () => string;
}

/**
 * 指示を送らずに claude を起動し、スラッシュコマンドとスキルの一覧だけを聞いて閉じる。
 * ユーザーとプロジェクトのコマンドを読むため、設定はそのまま読ませる（settingSources を絞らない）。
 * モデルを呼ばないので、トークンや契約の枠は使わない（2026-09-25 に実機で確認）
 */
export class AgentSdkCommandCatalog implements CommandCatalog {
  constructor(private readonly deps: AgentSdkCommandCatalogDeps) {}

  async list(cwd: string): Promise<SlashCommandInfo[]> {
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
      options: { cwd, pathToClaudeCodeExecutable: claudePath },
    });
    try {
      const commands = await query.supportedCommands();
      return commands.map((c) => ({
        name: c.name,
        description: c.description,
        argumentHint: c.argumentHint,
      }));
    } finally {
      release();
      query.close();
    }
  }
}
