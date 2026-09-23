import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import type { TaskPanels } from './taskPanel';
import { statusLabel, type TreeNode } from './taskTreeView';
import type { Settings } from './settings';

export interface CommandDeps {
  service: TaskService;
  panels: TaskPanels;
  settings: () => Settings;
}

function taskIdOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  const node = arg as TreeNode | undefined;
  return node?.kind === 'task' ? node.task.id : undefined;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { service, panels } = deps;
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
        const settings = deps.settings();
        const task = await service.create({
          prompt: prompt.trim(),
          cwd: folder.uri.fsPath,
          model: settings.defaultModel,
          permissionMode: settings.defaultPermissionMode,
        });
        await panels.open(task.id);
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
        if (choice === yes) {
          await service.delete(id);
        }
      })();
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
