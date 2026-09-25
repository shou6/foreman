import type { SlashCommandInfo } from '../domain/slashCommands';

/**
 * Claude Code のスラッシュコマンドとスキルの一覧（Claude Code に聞く）。実装は adapters/agentSdkCommandCatalog.ts。
 * モデルは呼ばないので、トークンや契約の枠は使わない
 */
export interface CommandCatalog {
  /** cwd はユーザーの作業フォルダ。プロジェクトのコマンドを読むため */
  list(cwd: string): Promise<SlashCommandInfo[]>;
}
