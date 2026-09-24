import type { SdkModelInfo } from '../domain/models';

/**
 * 使えるモデルの一覧（Claude Code に聞く）。実装は adapters/agentSdkModelCatalog.ts。
 * モデルは呼ばないので、トークンや契約の枠は使わない
 */
export interface ModelCatalog {
  list(): Promise<SdkModelInfo[]>;
}
