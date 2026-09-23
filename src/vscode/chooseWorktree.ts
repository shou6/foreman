import * as vscode from 'vscode';
import type { WorktreeService } from '../app/worktreeService';
import type { Worktree } from '../domain/task';

/**
 * タスクを worktree で動かすかを聞き、使うなら作る。
 * Git でないフォルダなら聞かずに undefined。ユーザーが取り消したら null
 */
export async function chooseWorktree(
  worktrees: WorktreeService,
  useWorktreeByDefault: boolean,
  folder: string,
  title: string,
  taskId: string
): Promise<Worktree | undefined | null> {
  const repo = await worktrees.repoRoot(folder);
  if (repo === undefined) {
    return undefined;
  }
  const yes = vscode.l10n.t('Yes, in a worktree');
  const no = vscode.l10n.t('No, in the workspace folder');
  const preferred = useWorktreeByDefault ? [yes, no] : [no, yes];
  const choice = await vscode.window.showQuickPick(preferred, {
    title: vscode.l10n.t('Run this task in a git worktree?'),
    ignoreFocusOut: true,
  });
  if (choice === undefined) {
    return null;
  }
  return choice === yes ? worktrees.create(repo, title, taskId) : undefined;
}
