/**
 * ユーザーの指示に効かせる記法は、引用（行頭の >）とフェンス付きコードブロック（```）と
 * インラインコード（`）だけ。それ以外は文字のまま出す（貼り付けた issue やログを描かないため）
 */
export type PromptBlock =
  | { kind: 'text'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string; lang: string | undefined };

const FENCE = /^```\s*([\w+#.-]*)\s*$/;
const QUOTE = /^>\s?(.*)$/;

/** 指示を上から読み、文・引用・コードブロックに分ける。フェンスの中は解釈しない */
export function promptBlocks(prompt: string): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  const push = (block: PromptBlock): void => {
    const last = blocks[blocks.length - 1];
    if (last !== undefined && last.kind === block.kind && block.kind !== 'code') {
      last.text += '\n' + block.text;
    } else {
      blocks.push(block);
    }
  };
  const lines = prompt.split(/\r?\n/);
  let code: { lang: string | undefined; lines: string[] } | undefined;
  for (const line of lines) {
    const fence = FENCE.exec(line);
    if (code !== undefined) {
      if (fence !== null) {
        blocks.push({ kind: 'code', text: code.lines.join('\n'), lang: code.lang });
        code = undefined;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    if (fence !== null) {
      code = { lang: fence[1] === '' ? undefined : fence[1], lines: [] };
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote !== null) {
      push({ kind: 'quote', text: quote[1] ?? '' });
    } else {
      push({ kind: 'text', text: line });
    }
  }
  if (code !== undefined) {
    // 閉じていないフェンスは末尾までコード
    blocks.push({ kind: 'code', text: code.lines.join('\n'), lang: code.lang });
  }
  return blocks.filter((b) => !(b.kind === 'text' && b.text === '' && blocks.length === 1));
}

/** 文をインラインコード（`…`）とそれ以外に分ける。閉じていなければそのまま */
export function inlineCode(text: string): { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = [];
  let rest = text;
  while (rest !== '') {
    const open = rest.indexOf('`');
    const close = open < 0 ? -1 : rest.indexOf('`', open + 1);
    if (open < 0 || close < 0) {
      parts.push({ code: false, text: rest });
      break;
    }
    if (open > 0) {
      parts.push({ code: false, text: rest.slice(0, open) });
    }
    parts.push({ code: true, text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return parts;
}

/** 一覧のカードに出す要約用。引用の > とフェンスの行とバッククォートを外し、中身は残す */
export function stripPromptMarks(prompt: string): string {
  return promptBlocks(prompt)
    .map((b) => (b.kind === 'text' ? b.text.replace(/`/g, '') : b.text))
    .join('\n');
}
