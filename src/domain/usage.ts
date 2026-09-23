import type { Task, Turn } from './task';

/** コンテキストの使用量（FR-VIEW-8）。used は最後の要求で送った入力（キャッシュ込み） */
export interface ContextUsage {
  used: number;
  /** モデルの窓の大きさ。SDK が返さなければ undefined */
  window: number | undefined;
  /** used / window。窓が無ければ undefined */
  ratio: number | undefined;
}

export interface TurnTokens {
  /** 入力（キャッシュの読み書きを含む） */
  input: number;
  output: number;
}

/** ターンのトークン数。結果が無ければ undefined */
export function turnTokens(turn: Turn): TurnTokens | undefined {
  const result = turn.result;
  if (result === undefined || !result.ok || result.usage === undefined) {
    return undefined;
  }
  const u = result.usage;
  return {
    input: u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens,
    output: u.outputTokens,
  };
}

/** 最後に結果のあるターンから、今のコンテキストの使用量を出す */
export function contextUsage(task: Pick<Task, 'turns'>): ContextUsage | undefined {
  for (let i = task.turns.length - 1; i >= 0; i--) {
    const turn = task.turns[i];
    const result = turn?.result;
    if (turn === undefined || result === undefined || !result.ok || result.usage === undefined) {
      continue;
    }
    const tokens = turnTokens(turn);
    if (tokens === undefined) {
      continue;
    }
    const window = result.usage.contextWindow > 0 ? result.usage.contextWindow : undefined;
    return {
      used: tokens.input,
      window,
      ratio: window === undefined ? undefined : Math.round((tokens.input / window) * 100) / 100,
    };
  }
  return undefined;
}

/** トークン数を短く表す: 999、1.5k、84k、200k、1.3M */
export function formatTokens(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    return (k < 100 ? k.toFixed(1).replace(/\.0$/, '') : String(Math.round(k))) + 'k';
  }
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
