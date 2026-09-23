import * as vscode from 'vscode';
import type { AutoTitle } from '../app/autoTitle';
import type { DiffService } from '../app/diffService';
import type { TaskService } from '../app/taskService';
import type { WorktreeService } from '../app/worktreeService';
import type { Task, Worktree } from '../domain/task';

export interface CheckpointDeps {
  service: TaskService;
  diffs: DiffService;
  worktrees: WorktreeService;
  autoTitle: AutoTitle;
  newId: () => string;
  openPanel: (taskId: string) => Promise<void>;
}

/** チェックポイント（ターン単位で戻す）と切り出し。確認の対話を含むので vscode 層に置く */
export class CheckpointActions {
  constructor(private readonly deps: CheckpointDeps) {}

  /** 指定のターンの直後の状態に戻す。ファイルだけか、会話も戻すかを選んでもらう */
  async rewind(taskId: string, turn: number): Promise<void> {
    const task = await this.deps.service.load(taskId);
    if (task === undefined) {
      return;
    }
    if (task.status === 'running' || task.status === 'waiting') {
      void vscode.window.showWarningMessage(vscode.l10n.t('Stop the task before rewinding.'));
      return;
    }
    const filesOnly = vscode.l10n.t('Files only');
    const both = vscode.l10n.t('Files and conversation');
    const choice = await vscode.window.showQuickPick([filesOnly, both], {
      title: vscode.l10n.t('Rewind to the end of turn {0}', String(turn + 1)),
      placeHolder: vscode.l10n.t(
        'Files: revert every change after this turn. Conversation: later turns are dropped and the next prompt continues from here in a forked session.'
      ),
    });
    if (choice === undefined) {
      return;
    }
    const skipped = await this.deps.diffs.revertAfter(taskId, turn);
    if (choice === both) {
      await this.deps.service.rewindConversation(taskId, turn);
    }
    if (skipped.length > 0) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Rewound, but {0} file(s) could not be reverted because their previous content is unknown: {1}',
          String(skipped.length),
          skipped.join(', ')
        )
      );
    } else {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Rewound to the end of turn {0}.', String(turn + 1))
      );
    }
  }

  /** 指定のターンの直後から分岐した新しいタスクを作る。親が worktree なら、その枝から新しい worktree を切る */
  async fork(taskId: string, turn?: number): Promise<void> {
    const parent = await this.deps.service.load(taskId);
    if (parent === undefined) {
      return;
    }
    if (parent.sessionId === undefined) {
      void vscode.window.showWarningMessage(vscode.l10n.t('This task has no session to fork.'));
      return;
    }
    const prompt = await vscode.window.showInputBox({
      title:
        turn === undefined
          ? vscode.l10n.t('Fork "{0}"', parent.title)
          : vscode.l10n.t('Fork "{0}" from turn {1}', parent.title, String(turn + 1)),
      prompt: vscode.l10n.t('What should the new task do?'),
      ignoreFocusOut: true,
    });
    if (prompt === undefined || prompt.trim() === '') {
      return;
    }
    const id = this.deps.newId();
    const worktree = await this.worktreeFor(parent, prompt.trim(), id);
    const child = await this.deps.service.fork(taskId, {
      id,
      prompt: prompt.trim(),
      cwd: parent.worktree?.repo ?? parent.cwd,
      worktree,
      fromTurn: turn,
    });
    await this.deps.openPanel(child.id);
    void this.deps.autoTitle.onCreated(child);
  }

  private async worktreeFor(
    parent: Task,
    title: string,
    id: string
  ): Promise<Worktree | undefined> {
    if (parent.worktree === undefined) {
      return undefined;
    }
    // 親の変更をコミットしてから枝を切ると、作業中のファイルの状態が引き継がれる
    await this.deps.worktrees.commitWork(parent.worktree, parent.title);
    return this.deps.worktrees.create(parent.worktree.repo, title, id, parent.worktree.branch);
  }
}
