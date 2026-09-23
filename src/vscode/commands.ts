import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import type { WorktreeService } from '../app/worktreeService';
import { chooseWorktree } from './chooseWorktree';
import type { Worktree } from '../domain/task';
import type { Settings } from './settings';
import type { TaskPanels } from './taskPanel';
import { statusLabel, type TreeNode } from './taskTreeView';
import type { WorktreeActions } from './worktreeActions';

export interface CommandDeps {
  service: TaskService;
  panels: TaskPanels;
  settings: () => Settings;
  worktrees: WorktreeService;
  worktreeActions: WorktreeActions;
  checkpoints: { fork(taskId: string, turn?: number): Promise<void> };
  review: {
    approve(taskId: string): Promise<void>;
    start(taskId: string): Promise<void>;
    editDraft(taskId: string): Promise<void>;
    newDraft(folder: string): Promise<import('../domain/task').Task | undefined>;
  };
  openBoard: () => void;
  newId: () => string;
  exportTask: (taskId: string) => Promise<void>;
  /** タスクの作成後に呼ぶ（タイトル付けなど）。待たない */
  afterCreate: (task: import('../domain/task').Task) => void;
}

function taskIdOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  const node = arg as TreeNode | undefined;
  return node?.kind === 'task' ? node.task.id : undefined;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { service, panels, worktrees, worktreeActions } = deps;
  const withError = (run: () => Promise<void>) => async (): Promise<void> => {
    try {
      await run();
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  /** 添付先のタスクを決める。1 つならそれ、複数なら選んでもらう */
  const pickTask = async (): Promise<string | undefined> => {
    const tasks = (await service.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (tasks.length === 0) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t('No tasks to attach to. Create a task first.')
      );
      return undefined;
    }
    if (tasks.length === 1) {
      return tasks[0]?.id;
    }
    const picked = await vscode.window.showQuickPick(
      tasks.map((task) => ({
        label: task.title,
        description: statusLabel(task.status),
        id: task.id,
      })),
      { title: vscode.l10n.t('Attach to which task?') }
    );
    return picked?.id;
  };

  /** Git リポジトリなら worktree を使うか聞く。使うなら作って返す。中止なら null */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'foreman.newTask',
      withError(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder === undefined) {
          void vscode.window.showErrorMessage(
            vscode.l10n.t('Open a folder before creating a task.')
          );
          return;
        }
        const prompt = await vscode.window.showInputBox({
          title: vscode.l10n.t('New Task'),
          prompt: vscode.l10n.t('What should Claude do?'),
          ignoreFocusOut: true,
        });
        if (prompt === undefined || prompt.trim() === '') {
          return;
        }
        const taskId = deps.newId();
        const worktree = await chooseWorktree(
          worktrees,
          deps.settings().useWorktree,
          folder.uri.fsPath,
          prompt.trim(),
          taskId
        );
        if (worktree === null) {
          return;
        }
        const settings = deps.settings();
        const task = await service.create({
          id: taskId,
          prompt: prompt.trim(),
          cwd: folder.uri.fsPath,
          worktree,
          model: settings.defaultModel,
          permissionMode: settings.defaultPermissionMode,
        });
        await panels.open(task.id);
        deps.afterCreate(task);
      })
    ),
    vscode.commands.registerCommand('foreman.openTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void panels.open(id);
      }
    }),
    vscode.commands.registerCommand('foreman.stopTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void withError(() => service.stop(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.deleteTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id === undefined) {
        return;
      }
      void withError(async () => {
        const task = await service.load(id);
        if (task === undefined) {
          return;
        }
        const yes = vscode.l10n.t('Delete');
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t('Delete task "{0}"?', task.title),
          { modal: true },
          yes
        );
        if (choice !== yes) {
          return;
        }
        if (task.status === 'running' || task.status === 'waiting') {
          await service.stop(id);
        }
        if (await worktreeActions.beforeDelete(id)) {
          await service.delete(id);
        }
      })();
    }),
    vscode.commands.registerCommand('foreman.mergeTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void withError(() => worktreeActions.merge(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.exportTask', (arg: unknown) => {
      void withError(async () => {
        const id = taskIdOf(arg) ?? (await pickTask());
        if (id !== undefined) {
          await deps.exportTask(id);
        }
      })();
    }),
    // 一覧の右クリック「ここから切り出す」。最後のターンから分岐する（FR-TASK-12）
    vscode.commands.registerCommand('foreman.forkTask', (arg: unknown) => {
      void withError(async () => {
        const id = taskIdOf(arg) ?? (await pickTask());
        if (id !== undefined) {
          await deps.checkpoints.fork(id);
        }
      })();
    }),
    vscode.commands.registerCommand('foreman.approveTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void withError(() => deps.review.approve(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.startTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void withError(() => deps.review.start(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.editDraft', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void withError(() => deps.review.editDraft(id))();
      }
    }),
    vscode.commands.registerCommand(
      'foreman.newDraft',
      withError(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder === undefined) {
          void vscode.window.showErrorMessage(
            vscode.l10n.t('Open a folder before creating a task.')
          );
          return;
        }
        const task = await deps.review.newDraft(folder.uri.fsPath);
        if (task !== undefined) {
          deps.afterCreate(task);
        }
      })
    ),
    vscode.commands.registerCommand('foreman.openBoard', () => deps.openBoard()),
    vscode.commands.registerCommand('foreman.discardTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        void withError(() => worktreeActions.discard(id))();
      }
    }),
    // エクスプローラーとタブの右クリック「タスクに添付」（FR-VIEW-5）
    vscode.commands.registerCommand(
      'foreman.attachToTask',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
        void withError(async () => {
          const targets = uris ?? (uri !== undefined ? [uri] : []);
          const active = vscode.window.activeTextEditor?.document.uri;
          const files = (targets.length > 0 ? targets : active !== undefined ? [active] : [])
            .filter((u) => u.scheme === 'file')
            .map((u) => u.fsPath);
          if (files.length === 0) {
            return;
          }
          const taskId = await pickTask();
          if (taskId === undefined) {
            return;
          }
          await panels.open(taskId);
          panels.attach(taskId, files);
        })();
      }
    )
  );
}
