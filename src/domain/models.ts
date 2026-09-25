import { shortModel } from './labels';
import type { EffortLevel } from './task';

/** Effort の段階（低い順） */
export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** モデルの選択肢 */
export interface ModelOption {
  /** Claude Code に渡す名前（例: sonnet、claude-opus-5） */
  value: string;
  /** 画面に出す名前（例: Sonnet） */
  label: string;
  /** ホバーで出す説明。無ければ空 */
  description: string;
  /** 名前が指す実際のモデル（例: claude-sonnet-5）。分からなければ undefined */
  resolved?: string;
  /** 対応する Effort の段階。空なら対応していない。分からなければ undefined */
  efforts?: EffortLevel[];
}

/** Claude Code が返すモデルの情報のうち、使う分だけ（SDK の ModelInfo と同じ形） */
export interface SdkModelInfo {
  value: string;
  displayName: string;
  description: string;
  resolvedModel?: string;
  supportedEffortLevels?: EffortLevel[];
}

export interface ModelList {
  models: ModelOption[];
  /** 既定（モデルを指定しない時）の中身。分からなければ undefined */
  defaultModel: ModelOption | undefined;
}

/** 一覧を取得できない時の選択肢。名前をそのまま画面にも出す */
export const FALLBACK_MODELS: ModelOption[] = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
].map((value) => ({ value, label: value, description: '' }));

function optionOf(info: SdkModelInfo): ModelOption {
  return {
    value: info.value,
    label: info.displayName,
    description: info.description,
    resolved: info.resolvedModel,
    efforts: info.supportedEffortLevels ?? [],
  };
}

/** そのモデルで選べる Effort の段階。分からなければすべて、対応していなければ空 */
export function effortsFor(option: ModelOption | undefined): readonly EffortLevel[] {
  return option?.efforts ?? EFFORT_LEVELS;
}

/** Claude Code が返す一覧を選択肢にする。default は「既定」の中身に回す。空なら固定の一覧 */
export function modelsFromSdk(infos: readonly SdkModelInfo[]): ModelList {
  if (infos.length === 0) {
    return { models: FALLBACK_MODELS, defaultModel: undefined };
  }
  const found = infos.find((info) => info.value === 'default');
  return {
    models: latestOnly(infos.filter((info) => info.value !== 'default')).map(optionOf),
    defaultModel: found === undefined ? undefined : optionOf(found),
  };
}

/** 系統と版（claude-opus-4-8 なら opus と [4, 8]）。日付の版と [1m] などの続きは除く。分からなければ undefined */
function familyOf(info: SdkModelInfo): { family: string; version: number[] } | undefined {
  const match = /^claude-([a-z]+)-(\d+(?:-\d+)*)/.exec(info.resolvedModel ?? info.value);
  if (match === null) {
    return undefined;
  }
  const version = (match[2] ?? '')
    .split('-')
    .filter((part) => part.length < 8)
    .map(Number);
  return { family: match[1] ?? '', version };
}

function compareVersion(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * 系統（Opus・Fable・Sonnet・Haiku）ごとに、いちばん新しい版だけを残す。同じ版が複数あれば先のものだけ。
 * Claude Code は古い版も返すが、選択肢が増えすぎるため。系統の分からないモデルはそのまま残す
 */
function latestOnly(infos: readonly SdkModelInfo[]): SdkModelInfo[] {
  const newest = new Map<string, number[]>();
  for (const info of infos) {
    const parsed = familyOf(info);
    const current = parsed === undefined ? undefined : newest.get(parsed.family);
    if (
      parsed !== undefined &&
      (current === undefined || compareVersion(parsed.version, current) > 0)
    ) {
      newest.set(parsed.family, parsed.version);
    }
  }
  const taken = new Set<string>();
  return infos.filter((info) => {
    const parsed = familyOf(info);
    if (parsed === undefined) {
      return true;
    }
    const latest = newest.get(parsed.family) ?? [];
    if (compareVersion(parsed.version, latest) !== 0 || taken.has(parsed.family)) {
      return false;
    }
    taken.add(parsed.family);
    return true;
  });
}

/**
 * 既定（モデルを指定しない時）で動くモデルの、画面に出す名前（例: Opus 5.5）。
 * Claude Code の説明の先頭（「 · 」と「 with 」の前）から取り、無ければ実際のモデルの名前
 */
export function defaultModelName(option: ModelOption | undefined): string | undefined {
  if (option === undefined) {
    return undefined;
  }
  const head = option.description.split(' · ')[0]?.split(' with ')[0]?.trim() ?? '';
  if (head !== '') {
    return head;
  }
  return option.resolved === undefined ? undefined : shortModel(option.resolved);
}

/** 版の日付の続き（-20251001） */
const DATE_SUFFIX = /^-\d{8}$/;

/**
 * モデルの名前（SDK の init が返す名前や、設定に書いた正式な ID）が、その選択肢と同じか。
 * 名前か実際のモデルが一致すれば同じ。日付付きの版（claude-haiku-4-5-20251001）も同じとみなす。
 * 日付でない続きは別の版なので同じとみなさない（claude-opus-5 と claude-opus-5-5）
 */
export function isSameModel(active: string, option: ModelOption): boolean {
  const names = [option.value, option.resolved].filter((n): n is string => n !== undefined);
  return names.some(
    (name) =>
      active === name ||
      (active.startsWith(name) && DATE_SUFFIX.test(active.slice(name.length))) ||
      (name.startsWith(active) && DATE_SUFFIX.test(name.slice(active.length)))
  );
}

/** 実際に動いたモデルの、画面に出す名前。一覧にあればその名前、無ければ claude- を外した名前 */
export function modelLabel(active: string, options: readonly ModelOption[]): string {
  return options.find((option) => isSameModel(active, option))?.label ?? shortModel(active);
}
