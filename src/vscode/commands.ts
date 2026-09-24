import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import type { WorktreeService } from '../app/worktreeService';
import { chooseWorktree } from './chooseWorktree';
import { applyPreset } from '../domain/presets';
import { isTurnOpen, type Task, type Worktree } from '../domain/task';
import type { Settings } from './settings';
import type { TaskPanels } from './taskPanel';
import { statusLabel } from './statusLabel';
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
    unapprove(taskId: string): Promise<void>;
    start(taskId: string): Promise<void>;
    editDraft(taskId: string): Promise<void>;
    newDraft(folder: string): Promise<import('../domain/task').Task | undefined>;
  };
  openBoard: () => void;
  newId: () => string;
  exportTask: (taskId: string) => Promise<void>;
  /** エディタの選択範囲を添付の形にする（エディタの右クリック用） */
  selectionOf: (
    editor: vscode.TextEditor | undefined
  ) => import('../domain/attachments').Attachment | undefined;
  /** タスクの作成後に呼ぶ（タイトル付けなど）。待たない */
  afterCreate: (task: import('../domain/task').Task) => void;
}

function taskIdOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  // 左サイドバー（Webview）の右クリックは data-vscode-context の内容が届く
  const context = arg as { taskId?: unknown } | undefined;
  return typeof context?.taskId === 'string' ? context.taskId : undefined;
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

  /**
   * 操作の対象のタスクを決める。1 つならそれ、複数なら選んでもらう。
   * title は選ぶ画面の見出し、filter は候補の絞り込み（無ければ全部）
   */
  const pickTask = async (
    title: string = vscode.l10n.t('Attach to which task?'),
    filter: (task: Task) => boolean = () => true
  ): Promise<string | undefined> => {
    const tasks = (await service.list())
      .filter(filter)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (tasks.length === 0) {
      void vscode.window.showErrorMessage(vscode.l10n.t('No tasks. Create a task first.'));
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
      { title }
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
          prompt: applyPreset(prompt.trim(), settings.presets).prompt,
          cwd: folder.uri.fsPath,
          worktree,
          model: settings.defaultModel,
          effort: settings.defaultEffort,
          permissionMode: settings.defaultPermissionMode,
        });
        await panels.open(task.id);
        deps.afterCreate(task);
      })
    ),
    vscode.commands.registerCommand('foreman.openTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        return panels.open(id);
      }
    }),
    vscode.commands.registerCommand('foreman.stopTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        return withError(() => service.stop(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.deleteTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id === undefined) {
        return;
      }
      return withError(async () => {
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
        if (isTurnOpen(task)) {
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
        return withError(() => worktreeActions.merge(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.exportTask', (arg: unknown) => {
      return withError(async () => {
        const id = taskIdOf(arg) ?? (await pickTask(vscode.l10n.t('Export which task?')));
        if (id !== undefined) {
          await deps.exportTask(id);
        }
      })();
    }),
    vscode.commands.registerCommand('foreman.renameTask', (arg: unknown) => {
      return withError(async () => {
        const id = taskIdOf(arg) ?? (await pickTask(vscode.l10n.t('Rename which task?')));
        if (id !== undefined) {
          await renameTask(service, id);
        }
      })();
    }),
    // 一覧の右クリック「ここから切り出す」。最後のターンから分岐する（FR-TASK-12）
    vscode.commands.registerCommand('foreman.forkTask', (arg: unknown) => {
      return withError(async () => {
        // 右クリックと同じく、動いている間と下書きは切り出せない
        const id =
          taskIdOf(arg) ??
          (await pickTask(
            vscode.l10n.t('Fork which task?'),
            (task) => !isTurnOpen(task) && task.status !== 'draft'
          ));
        if (id !== undefined) {
          await deps.checkpoints.fork(id);
        }
      })();
    }),
    vscode.commands.registerCommand('foreman.approveTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        return withError(() => deps.review.approve(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.unapproveTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        return withError(() => deps.review.unapprove(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.startTask', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        return withError(() => deps.review.start(id))();
      }
    }),
    vscode.commands.registerCommand('foreman.editDraft', (arg: unknown) => {
      const id = taskIdOf(arg);
      if (id !== undefined) {
        return withError(() => deps.review.editDraft(id))();
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
        return withError(() => worktreeActions.discard(id))();
      }
    }),
    // エディタの右クリック「選択範囲をタスクに添付」（FR-VIEW-12）。右クリックの時点ではエディタがアクティブ
    vscode.commands.registerCommand('foreman.attachSelectionToTask', () => {
      const item = deps.selectionOf(vscode.window.activeTextEditor);
      return withError(async () => {
        if (item === undefined) {
          return;
        }
        const taskId = await pickTask();
        if (taskId === undefined) {
          return;
        }
        await panels.open(taskId);
        panels.attach(taskId, [item]);
      })();
    }),
    // エクスプローラーとタブの右クリック「タスクに添付」（FR-VIEW-5）
    vscode.commands.registerCommand(
      'foreman.attachToTask',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
        return withError(async () => {
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
          panels.attach(
            taskId,
            files.map((path) => ({ kind: 'file', path }))
          );
        })();
      }
    )
  );
}

/** タスク名を聞いて変える。空なら何もしない */
export async function renameTask(service: TaskService, taskId: string): Promise<void> {
  const task = await service.load(taskId);
  if (task === undefined) {
    return;
  }
  const title = await vscode.window.showInputBox({
    title: vscode.l10n.t('Rename Task'),
    value: task.title,
    ignoreFocusOut: true,
  });
  if (title === undefined || title.trim() === '') {
    return;
  }
  await service.rename(taskId, title);
}
