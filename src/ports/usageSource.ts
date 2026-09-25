/**
 * 契約の利用枠（Claude Code に聞く）。実装は adapters/agentSdkUsage.ts。
 * モデルは呼ばないので、トークンや契約の枠は使わない。
 * 返すのは SDK の応答そのもの（形は domain/rateLimits.ts で解釈する）。取れない時は undefined
 */
export interface UsageSource {
  usage(): Promise<unknown>;
}
