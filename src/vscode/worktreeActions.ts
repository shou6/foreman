import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import type { WorktreeService } from '../app/worktreeService';
import { isTurnOpen } from '../domain/task';

/**
 * worktree のマージ・破棄・タスク削除時の後始末。確認の対話を含むので vscode 層に置く。
 * マージや破棄の後は、タスクの作業ディレクトリを元のリポジトリに戻す
 */
export class WorktreeActions {
  constructor(
    private readonly service: TaskService,
    private readonly worktrees: WorktreeService
  ) {}

  async merge(taskId: string): Promise<void> {
    const task = await this.service.load(taskId);
    if (task === undefined || task.worktree === undefined) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('This task does not use a worktree.')
      );
      return;
    }
    if (isTurnOpen(task)) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Stop the task before merging or discarding its worktree.')
      );
      return;
    }
    const { worktree } = task;
    // プロセスが作業ディレクトリを掴んでいると Windows では消せないので、先に閉じる
    await this.service.close(taskId);
    let result;
    try {
      result = await this.worktrees.merge(worktree, task.title);
    } catch (error) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t('Merge failed: {0}', error instanceof Error ? error.message : String(error))
      );
      return;
    }
    await this.service.patch(taskId, (t) => ({ ...t, worktree: undefined, cwd: worktree.repo }));
    if (result.removed) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Merged {0} into {1}.', worktree.branch, worktree.base)
      );
    } else {
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Merged {0} into {1}. The worktree folder could not be removed yet; Foreman will clean it up on the next start.',
          worktree.branch,
          worktree.base
        )
      );
    }
  }

  async discard(taskId: string): Promise<void> {
    const task = await this.service.load(taskId);
    if (task === undefined || task.worktree === undefined) {
      return;
    }
    if (isTurnOpen(task)) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Stop the task before merging or discarding its worktree.')
      );
      return;
    }
    const yes = vscode.l10n.t('Discard');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('Discard the worktree of "{0}"? Unmerged changes will be lost.', task.title),
      { modal: true },
      yes
    );
    if (choice !== yes) {
      return;
    }
    const { worktree } = task;
    await this.service.close(taskId);
    await this.worktrees.discard(worktree);
    await this.service.patch(taskId, (t) => ({ ...t, worktree: undefined, cwd: worktree.repo }));
  }

  /**
   * タスクの削除の前に呼ぶ。worktree があれば、未マージの変更を確認してから消す。
   * 続けてよければ true
   */
  async beforeDelete(taskId: string): Promise<boolean> {
    const task = await this.service.load(taskId);
    if (task === undefined || task.worktree === undefined) {
      return true;
    }
    if (await this.worktrees.hasChanges(task.worktree)) {
      const yes = vscode.l10n.t('Delete');
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Task "{0}" has unmerged changes in its worktree. Delete the task and discard them?',
          task.title
        ),
        { modal: true },
        yes
      );
      if (choice !== yes) {
        return false;
      }
    }
    await this.service.close(taskId);
    await this.worktrees.discard(task.worktree);
    return true;
  }
}
