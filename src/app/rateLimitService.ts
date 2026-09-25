import { rateLimitsFromSdk, type RateLimits } from '../domain/rateLimits';
import type { UsageSource } from '../ports/usageSource';

export interface RateLimitServiceDeps {
  now: () => string;
  onError?: (error: unknown) => void;
}

/** ターンの終わりでの取り直しの間隔（この時間の間は 1 回だけ） */
const AFTER_TURN_INTERVAL_MS = 60_000;

/**
 * 契約の利用枠。Claude Code に聞いた値を覚えておき、取り直したら画面へ知らせる。
 * 取得は claude を起動するので数秒かかる。ターンの終わりの取り直しは 1 分に 1 回までにする
 */
export class RateLimitService {
  private limits: RateLimits | undefined;
  private inFlight: Promise<void> | undefined;
  private lastFetchedAt: number | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly source: UsageSource,
    private readonly deps: RateLimitServiceDeps
  ) {}

  /** 今の利用枠。取得する前と、契約の枠が無い時は undefined */
  current(): RateLimits | undefined {
    return this.limits;
  }

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 取り直す。取得中なら、その完了を待つだけ */
  refresh(): Promise<void> {
    this.inFlight ??= this.fetch().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** ターンの終わりの取り直し。前回から 1 分たっていなければ何もしない */
  refreshAfterTurn(): Promise<void> {
    const now = Date.parse(this.deps.now());
    if (this.lastFetchedAt !== undefined && now - this.lastFetchedAt < AFTER_TURN_INTERVAL_MS) {
      return this.inFlight ?? Promise.resolve();
    }
    return this.refresh();
  }

  private async fetch(): Promise<void> {
    const now = this.deps.now();
    this.lastFetchedAt = Date.parse(now);
    let raw: unknown;
    try {
      raw = await this.source.usage();
    } catch (error) {
      this.deps.onError?.(error);
      return;
    }
    this.limits = rateLimitsFromSdk(raw, now);
    for (const listener of this.listeners) {
      listener();
    }
  }
}
