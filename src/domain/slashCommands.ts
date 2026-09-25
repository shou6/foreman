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
