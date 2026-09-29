/** 問い合わせに入れる差分の上限（文字数）。長い差分は切り詰める */
const MAX_DIFF = 30_000;

/** Claude でメッセージを作れなかった時の既定。Conventional Commits の形にする */
export function defaultCommitMessage(title: string): string {
  return `chore: ${title}`;
}

/**
 * worktree の変更をコミットする時の、メッセージの問い合わせ。
 * プロジェクトの CLAUDE.md や .claude/rules に規約があればそれに従わせ、無ければ Conventional Commits にする
 */
export function commitMessagePrompt(title: string, diff: string): string {
  const body = diff.length > MAX_DIFF ? `${diff.slice(0, MAX_DIFF)}\n... (truncated)` : diff;
  return [
    'Write a git commit message for the staged changes below.',
    'If the project instructions define a commit message convention, follow it exactly.',
    'Otherwise use Conventional Commits: `<type>(<scope>): <summary>`, where type is one of ' +
      'feat, fix, docs, refactor, test, chore and the scope is optional. ' +
      'Write the summary in the same language as the task title.',
    'Reply with the commit message only, no code fences, no explanation.',
    '',
    `Task title: ${title}`,
    '',
    'Staged changes:',
    body,
  ].join('\n');
}

/** 返事からメッセージを取り出す。前後の空白とコードフェンスを外す。空なら undefined */
export function cleanCommitMessage(text: string): string | undefined {
  const message = text
    .trim()
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  return message === '' ? undefined : message;
}
