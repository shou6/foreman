import type { Preset } from './presets';

/** Claude Code のスラッシュコマンドとスキル（SDK の supportedCommands から） */
export interface SlashCommandInfo {
  /** 先頭の / を除いた名前 */
  name: string;
  description: string;
  /** 引数のヒント（例: <file>）。無ければ空 */
  argumentHint: string;
}

/** 入力欄の / の候補。プリセットと Claude Code のコマンドを並べる */
export interface SlashCandidate {
  name: string;
  source: 'preset' | 'command';
  /** プリセットは本文の 1 行目、コマンドは説明 */
  description: string;
  argumentHint: string;
}

/**
 * / の後の文字で前方一致した候補。プリセットを先に、その後に Claude Code のコマンドを並べる。
 * 同じ名前はプリセットが勝つ（送る時もプリセットに置き換わるため）。空白が入ったら候補を出さない
 */
export function matchSlash(
  text: string,
  presets: readonly Preset[],
  commands: readonly SlashCommandInfo[]
): SlashCandidate[] {
  const match = /^\/(\S*)$/.exec(text);
  if (match === null) {
    return [];
  }
  const head = (match[1] ?? '').toLowerCase();
  const result: SlashCandidate[] = presets
    .filter((p) => p.name.startsWith(head))
    .map((p) => ({
      name: p.name,
      source: 'preset',
      description: p.prompt.split('\n')[0] ?? '',
      argumentHint: '',
    }));
  const taken = new Set(result.map((c) => c.name));
  for (const command of commands) {
    if (command.name.toLowerCase().startsWith(head) && !taken.has(command.name)) {
      taken.add(command.name);
      result.push({
        name: command.name,
        source: 'command',
        description: command.description,
        argumentHint: command.argumentHint,
      });
    }
  }
  return result;
}

/** 入力欄に出す候補の上限 */
export const MAX_SUGGESTIONS = 10;

export interface SlashSuggestions {
  items: SlashCandidate[];
  /** 合う候補のうち出していない数（/ だけの時は、コマンドとスキルの全部） */
  hidden: number;
}

/** 名前の全体か、: で区切った各部分が head で始まるか */
function startsWithSegment(name: string, head: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith(head) || lower.split(':').some((part) => part.startsWith(head));
}

/**
 * 入力欄に出す候補。/ だけならプリセットだけを出し、コマンドは件数だけ知らせる。
 * 1 文字以上で前方一致（: で区切った部分でも）に絞り、上限を超えた分は hidden に数える。
 * 候補を出す状況でなければ undefined
 */
export function slashSuggestions(
  text: string,
  presets: readonly Preset[],
  commands: readonly SlashCommandInfo[],
  max: number = MAX_SUGGESTIONS
): SlashSuggestions | undefined {
  const match = /^\/(\S*)$/.exec(text);
  if (match === null) {
    return undefined;
  }
  const head = (match[1] ?? '').toLowerCase();
  const presetItems: SlashCandidate[] = presets
    .filter((p) => p.name.startsWith(head))
    .map((p) => ({
      name: p.name,
      source: 'preset',
      description: p.prompt.split('\n')[0] ?? '',
      argumentHint: '',
    }));
  if (head === '') {
    return { items: presetItems.slice(0, max), hidden: commands.length };
  }
  const taken = new Set(presetItems.map((c) => c.name));
  const all: SlashCandidate[] = [...presetItems];
  for (const command of commands) {
    if (!taken.has(command.name) && startsWithSegment(command.name, head)) {
      taken.add(command.name);
      all.push({
        name: command.name,
        source: 'command',
        description: command.description,
        argumentHint: command.argumentHint,
      });
    }
  }
  return { items: all.slice(0, max), hidden: Math.max(0, all.length - max) };
}
