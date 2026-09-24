import { shortModel } from './labels';

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
}

/** Claude Code が返すモデルの情報のうち、使う分だけ（SDK の ModelInfo と同じ形） */
export interface SdkModelInfo {
  value: string;
  displayName: string;
  description: string;
  resolvedModel?: string;
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
  };
}

/** Claude Code が返す一覧を選択肢にする。default は「既定」の中身に回す。空なら固定の一覧 */
export function modelsFromSdk(infos: readonly SdkModelInfo[]): ModelList {
  if (infos.length === 0) {
    return { models: FALLBACK_MODELS, defaultModel: undefined };
  }
  const found = infos.find((info) => info.value === 'default');
  return {
    models: infos.filter((info) => info.value !== 'default').map(optionOf),
    defaultModel: found === undefined ? undefined : optionOf(found),
  };
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
