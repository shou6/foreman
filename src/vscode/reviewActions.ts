import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import type { WorktreeService } from '../app/worktreeService';
import { isTurnOpen, type Task, type Worktree } from '../domain/task';
import { chooseWorktree } from './chooseWorktree';
import type { Settings } from './settings';

export interface ReviewDeps {
  service: TaskService;
  worktrees: WorktreeService;
  settings: () => Settings;
  openPanel: (taskId: string) => Promise<void>;
  afterStart: (task: Task) => void;
}

/** レビュー待ちの承認と、下書きの作成・開始。確認の対話を含むので vscode 層に置く */
export class ReviewActions {
  constructor(private readonly deps: ReviewDeps) {}

  /** 変更を確認済みにして完了にする。worktree のマージは別（右サイドバーの仕上げ） */
  async approve(taskId: string): Promise<void> {
    const task = await this.deps.service.load(taskId);
    if (task === undefined) {
      return;
    }
    if (task.status !== 'review' && !(task.status === 'waiting' && !isTurnOpen(task))) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Task "{0}" has no changes waiting for review.', task.title)
      );
      return;
    }
    await this.deps.service.approve(taskId);
  }

  /** 指示を聞いて下書きを作る。セッションは起動しない */
  async newDraft(folder: string): Promise<Task | undefined> {
    const prompt = await vscode.window.showInputBox({
      title: vscode.l10n.t('New Draft'),
      prompt: vscode.l10n.t('What should Claude do? You can start it later from the board.'),
      ignoreFocusOut: true,
    });
    if (prompt === undefined || prompt.trim() === '') {
      return undefined;
    }
    const settings = this.deps.settings();
    return this.deps.service.createDraft({
      prompt: prompt.trim(),
      cwd: folder,
      model: settings.defaultModel,
      permissionMode: settings.defaultPermissionMode,
    });
  }

  /** 下書きの指示を書き換える */
  async editDraft(taskId: string): Promise<void> {
    const task = await this.deps.service.load(taskId);
    if (task === undefined || task.status !== 'draft') {
      return;
    }
    const prompt = await vscode.window.showInputBox({
      title: vscode.l10n.t('Edit Draft'),
      value: task.draftPrompt,
      ignoreFocusOut: true,
    });
    if (prompt === undefined || prompt.trim() === '') {
      return;
    }
    await this.deps.service.updateDraft(taskId, prompt.trim());
  }

  /** 下書きを開始する。Git のフォルダなら worktree を使うかを聞く */
  async start(taskId: string): Promise<void> {
    const task = await this.deps.service.load(taskId);
    if (task === undefined || task.status !== 'draft') {
      return;
    }
    let worktree: Worktree | undefined | null;
    worktree = await chooseWorktree(
      this.deps.worktrees,
      this.deps.settings().useWorktree,
      task.cwd,
      task.draftPrompt ?? task.title,
      task.id
    );
    if (worktree === null) {
      return;
    }
    const started = await this.deps.service.start(taskId, { worktree });
    await this.deps.openPanel(taskId);
    this.deps.afterStart(started);
  }
}
