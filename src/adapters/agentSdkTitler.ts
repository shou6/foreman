import type { Options } from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };

/** query() のうち、タイトル付けに使う最小限の形。テストではフェイクに差し替える */
export type TitleQueryFn = (params: {
  prompt: string;
  options?: Options;
}) => AsyncIterable<{ type: string; subtype?: string; result?: string }>;

export interface TitleRequest {
  prompt: string;
  /** 例: claude-haiku-4-5 */
  model: string;
  claudePath: string;
  cwd: string;
}

const MAX_TITLE = 40;

/** モデルの返答から 1 行のタイトルを取り出す。引用符・句点・接頭辞を外し、長ければ切る */
export function cleanTitle(text: string): string | undefined {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== '');
  if (first === undefined) {
    return undefined;
  }
  let title = first
    .replace(/^(title|タイトル)\s*[:：]\s*/i, '')
    .replace(/^["'「『“]+|["'」』”]+$/g, '')
    .replace(/[。．.]+$/, '')
    .trim();
  if (title === '') {
    return undefined;
  }
  const chars = Array.from(title);
  if (chars.length > MAX_TITLE) {
    title = chars.slice(0, MAX_TITLE).join('') + '…';
  }
  return title;
}

/**
 * 軽いモデルに 1 回だけ問い合わせてタイトルを作る。
 * ツールを使わず、ユーザーの設定や hooks も読まない（settingSources: []）ので軽い。
 * 失敗しても例外にせず undefined を返す
 */
export async function suggestTitleWithSdk(
  query: TitleQueryFn,
  request: TitleRequest
): Promise<string | undefined> {
  const prompt =
    'Write a short title (at most 24 characters, same language as the request) for this task request. ' +
    'Reply with the title only, no quotes, no explanation.\n\nRequest:\n' +
    request.prompt;
  try {
    const messages = query({
      prompt,
      options: {
        model: request.model,
        cwd: request.cwd,
        pathToClaudeCodeExecutable: request.claudePath,
        tools: [],
        settingSources: [],
        permissionMode: 'dontAsk',
      },
    });
    for await (const m of messages) {
      if (m.type === 'result') {
        return m.subtype === 'success' && typeof m.result === 'string'
          ? cleanTitle(m.result)
          : undefined;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
