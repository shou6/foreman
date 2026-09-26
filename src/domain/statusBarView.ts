import { planUsageEntries, type PlanUsageItem, type RateLimits } from './rateLimits';
import { statusCounts } from './statusCounts';
import type { Task } from './task';
import { contextUsage, formatTokens } from './usage';

/** 翻訳関数（vscode.l10n.t）。第 1 引数は文字列リテラルで渡す */
export type Translate = (message: string, ...args: string[]) => string;

export interface StatusBarItemView {
  text: string;
  tooltip: string;
}

export interface StatusBarInput {
  tasks: readonly Task[];
  /** 今見ているタスク */
  activeId?: string;
  /** 契約の利用枠。出さない時は undefined */
  limits?: RateLimits;
  /** 利用枠のうち、出す項目 */
  planUsageItems: readonly PlanUsageItem[];
}

/**
 * ステータスバーの 2 つの項目の中身（FR-NOTIFY-2）。出さない項目は undefined。
 * Foreman の項目は今見ているタスクと実行中の件数。「あなたの番」は説明にだけ出す。
 * Claude の項目は契約の利用枠で、Foreman のものに見えないよう分けて出す
 */
export function statusBarView(
  input: StatusBarInput,
  t: Translate
): { foreman?: StatusBarItemView; claude?: StatusBarItemView } {
  return { foreman: foremanItem(input, t), claude: claudeItem(input, t) };
}

function foremanItem(input: StatusBarInput, t: Translate): StatusBarItemView | undefined {
  const { running, yourTurn } = statusCounts(input.tasks);
  const parts: string[] = [];
  const active = input.tasks.find((task) => task.id === input.activeId);
  if (active !== undefined) {
    const model = active.activeModel ?? active.model;
    const usage = contextUsage(active);
    const context =
      usage === undefined
        ? undefined
        : usage.ratio === undefined
          ? formatTokens(usage.used)
          : `${Math.round(usage.ratio * 100)}%`;
    const detail = [model, context].filter((v) => v !== undefined).join(' ');
    if (detail !== '') {
      parts.push(`$(tasklist) ${detail}`);
    }
  }
  if (running > 0) {
    parts.push(t('$(sync~spin) {0} running', String(running)));
  }
  if (parts.length === 0) {
    return undefined;
  }
  return {
    text: 'Foreman: ' + parts.join(' · '),
    tooltip: t('Foreman: {0} running, {1} waiting for you', String(running), String(yourTurn)),
  };
}

function claudeItem(input: StatusBarInput, t: Translate): StatusBarItemView | undefined {
  const limits = input.limits;
  if (limits === undefined) {
    return undefined;
  }
  // 設定で選んだ項目を「5h 22% · 7d 45% · Fable 73%」のように短く出す
  const entries = planUsageEntries(limits, [...input.planUsageItems]);
  if (entries.length === 0) {
    return undefined;
  }
  const short = entries.map((e) =>
    e.kind === 'fiveHour'
      ? t('5h {0}%', String(e.utilization))
      : e.kind === 'sevenDay'
        ? t('7d {0}%', String(e.utilization))
        : `${e.name ?? ''} ${e.utilization}%`
  );
  const lines = [
    t(
      'Plan usage: 5-hour {0}%, 7-day {1}%',
      String(limits.fiveHour?.utilization ?? '-'),
      String(limits.sevenDay?.utilization ?? '-')
    ),
    ...limits.models.map((model) => `${model.name}: ${model.utilization}%`),
  ];
  return { text: 'Claude: ' + short.join(' · '), tooltip: lines.join('\n') };
}
