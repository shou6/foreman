/** 指示のプリセット（FR-VIEW-10）。入力欄で /名前 と打つと本文に置き換わる */
export interface Preset {
  /** 小文字の名前。入力欄では /名前 */
  name: string;
  /** 本文。{input} に、名前の後ろに書いた文が入る。無ければ後ろに足す */
  prompt: string;
}

export const DEFAULT_PRESETS: readonly Preset[] = [
  {
    name: 'fix',
    prompt:
      'Fix the following problem. Find the root cause before changing code, explain it briefly, then make the smallest change that fixes it and verify it.\n\n{input}',
  },
  {
    name: 'test',
    prompt:
      'Write tests for the following. Follow the existing test conventions of this project, cover the main path and the edge cases, and run the tests.\n\n{input}',
  },
  {
    name: 'review',
    prompt:
      'Review the following changes as a careful colleague. Point out bugs, risky assumptions and missing tests first, then style. Do not change code unless asked.\n\n{input}',
  },
];

const INPUT = '{input}';

/** 先頭の /名前 をプリセットの本文に置き換える。該当が無ければそのまま */
export function applyPreset(
  text: string,
  presets: readonly Preset[]
): { prompt: string; preset: string | undefined } {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (match === null) {
    return { prompt: text, preset: undefined };
  }
  const name = (match[1] ?? '').toLowerCase();
  const rest = (match[2] ?? '').trim();
  const preset = presets.find((p) => p.name === name);
  if (preset === undefined) {
    return { prompt: text, preset: undefined };
  }
  const prompt = preset.prompt.includes(INPUT)
    ? preset.prompt.split(INPUT).join(rest)
    : rest === ''
      ? preset.prompt
      : preset.prompt + '\n\n' + rest;
  return { prompt, preset: name };
}

/** 入力の途中に出す候補。/ の後の文字で前方一致。空白が入ったら候補を出さない */
export function matchPresets(text: string, presets: readonly Preset[]): Preset[] {
  const match = /^\/(\S*)$/.exec(text);
  if (match === null) {
    return [];
  }
  const head = (match[1] ?? '').toLowerCase();
  return presets.filter((p) => p.name.startsWith(head));
}

/** 設定の値からプリセットを読む。名前と本文が文字列のものだけ、名前は小文字、重複は先勝ち */
export function normalizePresets(values: readonly unknown[]): Preset[] {
  const seen = new Set<string>();
  const result: Preset[] = [];
  for (const value of values) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const { name, prompt } = value as { name?: unknown; prompt?: unknown };
    if (typeof name !== 'string' || typeof prompt !== 'string') {
      continue;
    }
    const key = name.trim().toLowerCase();
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ name: key, prompt });
  }
  return result;
}
