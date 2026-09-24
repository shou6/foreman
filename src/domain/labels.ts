/** モデル名を短くする（claude- を外す） */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, '');
}

/** worktree のブランチ名から接頭辞（設定 foreman.worktreeBranchPrefix）を外す */
export function shortBranch(branch: string, prefix: string | undefined): string {
  return prefix !== undefined && prefix !== '' && branch.startsWith(prefix)
    ? branch.slice(prefix.length)
    : branch;
}
