import { cleanCommitMessage, commitMessagePrompt } from '../domain/commitMessage';
import type { TitleQueryFn } from './agentSdkTitler';

export interface CommitMessageRequest {
  title: string;
  /** ステージした差分（統計と本文） */
  diff: string;
  model: string;
  claudePath: string;
  /** リポジトリのルート。ここの CLAUDE.md と .claude/rules を読ませる */
  cwd: string;
}

/**
 * 軽いモデルに 1 回だけ問い合わせて、コミットメッセージを作る。
 * ツールは使わない。プロジェクトの規約を読ませるため、設定は project と local だけ読む（CLAUDE.md と .claude/rules が入る）。
 * 失敗しても例外にせず undefined を返す
 */
export async function writeCommitMessageWithSdk(
  query: TitleQueryFn,
  request: CommitMessageRequest
): Promise<string | undefined> {
  try {
    const messages = query({
      prompt: commitMessagePrompt(request.title, request.diff),
      options: {
        model: request.model,
        cwd: request.cwd,
        pathToClaudeCodeExecutable: request.claudePath,
        tools: [],
        settingSources: ['project', 'local'],
        permissionMode: 'dontAsk',
      },
    });
    for await (const m of messages) {
      if (m.type === 'result') {
        // 未ログインなどの失敗は success でも is_error になり、result は案内の文
        return m.subtype === 'success' && m.is_error !== true && typeof m.result === 'string'
          ? cleanCommitMessage(m.result)
          : undefined;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
