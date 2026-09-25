/** 契約（Pro / Max）の利用枠。Claude Code に聞いた値 */
export interface RateLimitWindow {
  /** 使った割合（0〜100） */
  utilization: number;
  /** 回復の時刻（ISO）。分からなければ undefined */
  resetsAt: string | undefined;
}

export interface RateLimits {
  fiveHour: RateLimitWindow | undefined;
  sevenDay: RateLimitWindow | undefined;
  /** モデル別の 7 日枠 */
  models: { name: string; utilization: number; resetsAt: string | undefined }[];
  /** 取得した時刻（ISO） */
  fetchedAt: string;
}

/** 使用率の段階。メーターの色に使う */
export type RateLimitLevel = 'low' | 'mid' | 'high';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function windowOf(value: unknown): RateLimitWindow | undefined {
  const w = asRecord(value);
  if (typeof w.utilization !== 'number') {
    return undefined;
  }
  return {
    utilization: w.utilization,
    resetsAt: typeof w.resets_at === 'string' ? w.resets_at : undefined,
  };
}

/**
 * Claude Code の usage（実験中の API）の応答から利用枠を取り出す。
 * 契約の枠が無い（API キーなど）時や、窓が 1 つも無い時は undefined
 */
export function rateLimitsFromSdk(raw: unknown, now: string): RateLimits | undefined {
  const r = asRecord(raw);
  if (r.rate_limits_available !== true) {
    return undefined;
  }
  const limits = asRecord(r.rate_limits);
  const fiveHour = windowOf(limits.five_hour);
  const sevenDay = windowOf(limits.seven_day);
  if (fiveHour === undefined && sevenDay === undefined) {
    return undefined;
  }
  const models = (Array.isArray(limits.model_scoped) ? limits.model_scoped : [])
    .map((m) => {
      const model = asRecord(m);
      const window = windowOf(model);
      return typeof model.display_name === 'string' && window !== undefined
        ? { name: model.display_name, ...window }
        : undefined;
    })
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
  return { fiveHour, sevenDay, models, fetchedAt: now };
}

/** 回復までの分数（切り捨て）。過ぎていれば 0、分からなければ undefined */
export function untilReset(resetsAt: string | undefined, now: string): number | undefined {
  if (resetsAt === undefined) {
    return undefined;
  }
  const ms = Date.parse(resetsAt) - Date.parse(now);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : undefined;
}

export function levelOf(utilization: number): RateLimitLevel {
  return utilization >= 90 ? 'high' : utilization >= 70 ? 'mid' : 'low';
}

/** 画面に出す項目。設定 foreman.planUsage.* で選ぶ */
export type PlanUsageItem = 'fiveHour' | 'sevenDay' | 'models';

/** 既定はすべて、この順 */
export const PLAN_USAGE_ITEMS: readonly PlanUsageItem[] = ['fiveHour', 'sevenDay', 'models'];

/** 設定の値を項目の一覧にする。知らない値と重複は外す。配列でなければ既定 */
export function normalizePlanUsageItems(value: unknown): PlanUsageItem[] {
  if (!Array.isArray(value)) {
    return [...PLAN_USAGE_ITEMS];
  }
  const items: PlanUsageItem[] = [];
  for (const v of value) {
    const item = PLAN_USAGE_ITEMS.find((i) => i === v);
    if (item !== undefined && !items.includes(item)) {
      items.push(item);
    }
  }
  return items;
}

/** 画面に出す 1 行 */
export interface PlanUsageEntry {
  kind: 'fiveHour' | 'sevenDay' | 'model';
  /** モデル別の時のモデルの名前 */
  name?: string;
  utilization: number;
  resetsAt: string | undefined;
}

/** 設定で選んだ項目だけを、その順に並べる。無い窓は飛ばす */
export function planUsageEntries(
  limits: RateLimits,
  items: readonly PlanUsageItem[]
): PlanUsageEntry[] {
  const entries: PlanUsageEntry[] = [];
  for (const item of items) {
    if (item === 'models') {
      for (const m of limits.models) {
        entries.push({
          kind: 'model',
          name: m.name,
          utilization: m.utilization,
          resetsAt: m.resetsAt,
        });
      }
      continue;
    }
    const window = limits[item];
    if (window !== undefined) {
      entries.push({ kind: item, utilization: window.utilization, resetsAt: window.resetsAt });
    }
  }
  return entries;
}
