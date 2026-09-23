/** worktree を置くフォルダ（リポジトリからの相対、/ 区切り）。要件定義書 5.1 */
export const WORKTREE_DIR = '.foreman/worktrees';

/** ブランチ名の接頭辞 */
export const BRANCH_PREFIX = 'foreman/';

const MAX_SLUG = 40;

/** タイトルの slug とタスク ID の先頭 6 文字から、worktree とブランチの名前を作る */
export function worktreeName(title: string, taskId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  return (slug === '' ? 'task' : slug) + '-' + taskId.replace(/-/g, '').slice(0, 6);
}

export function worktreePath(repo: string, name: string, sep: string): string {
  const base = repo.endsWith(sep) ? repo.slice(0, -1) : repo;
  return [base, ...WORKTREE_DIR.split('/'), name].join(sep);
}

export function branchName(name: string): string {
  return BRANCH_PREFIX + name;
}
