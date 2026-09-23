/**
 * ソースコードから翻訳対象の文字列（vscode.l10n.t や、翻訳関数 t に渡している文字列リテラル）を取り出す。
 * 翻訳の抜けを検出するテストで使う。
 *
 * 対象は第 1 引数が単一の文字列リテラルの呼び出しだけ。文字列を + でつないで渡すと実行時のキーと
 * 一致しなくなるので、そういう書き方はしない（してしまった場合はテストが検出する）。
 */

/**
 * 翻訳関数の呼び出しの開始位置。`t(` か `l10n.t(`。
 * 直前が識別子の一部（format( の t など）や、l10n 以外のプロパティ（obj.emit( など）のものは除く。
 */
const CALL = /(?<![\w$.])(?:vscode\.l10n\.|l10n\.)?t\(\s*/g;

/** 位置 start から始まる文字列リテラル（' か "）を読む。リテラルでなければ undefined */
function readStringLiteral(
  source: string,
  start: number
): { value: string; end: number } | undefined {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') {
    return undefined;
  }
  let value = '';
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') {
      const next = source[i + 1];
      value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      i++;
    } else if (ch === quote) {
      return { value, end: i + 1 };
    } else if (ch === '\n') {
      return undefined;
    } else {
      value += ch;
    }
  }
  return undefined;
}

interface Call {
  /** 第 1 引数が単一の文字列リテラルならその値 */
  literal?: string;
  /** 呼び出しの先頭部分（報告用） */
  snippet: string;
}

function findCalls(source: string): Call[] {
  const calls: Call[] = [];
  for (const match of source.matchAll(CALL)) {
    const argStart = (match.index ?? 0) + match[0].length;
    const snippet = source.slice(match.index ?? 0, argStart + 40).replace(/\s+/g, ' ');
    const literal = readStringLiteral(source, argStart);
    if (!literal) {
      calls.push({ snippet });
      continue;
    }
    // リテラルの直後が , か ) でなければ、+ でつないだ式などになっている
    const after = source.slice(literal.end).match(/^\s*(.)/)?.[1];
    calls.push(after === ',' || after === ')' ? { literal: literal.value, snippet } : { snippet });
  }
  return calls;
}

export function extractL10nStrings(source: string): string[] {
  return [
    ...new Set(
      findCalls(source)
        .map((call) => call.literal)
        .filter((literal): literal is string => literal !== undefined)
    ),
  ];
}

/** 翻訳関数の第 1 引数が単一の文字列リテラルになっていない呼び出しを返す（あってはならない） */
export function findUntranslatableCalls(source: string): string[] {
  return findCalls(source)
    .filter((call) => call.literal === undefined)
    .map((call) => call.snippet);
}
