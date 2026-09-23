import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import { isTurnOpen, type Task, type TaskStatus } from '../domain/task';

export type TreeNode =
  { kind: 'group'; status: TaskStatus; tasks: Task[] } | { kind: 'task'; task: Task };

/** 一覧に出す順。手が要るものを上にする */
const ORDER: TaskStatus[] = [
  'waiting',
  'running',
  'review',
  'interrupted',
  'failed',
  'done',
  'draft',
];

const ICONS: Record<TaskStatus, string> = {
  draft: 'edit',
  running: 'sync~spin',
  waiting: 'bell',
  review: 'eye',
  done: 'check',
  failed: 'error',
  interrupted: 'debug-pause',
};

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'draft':
      return vscode.l10n.t('Draft');
    case 'review':
      return vscode.l10n.t('Review');
    case 'running':
      return vscode.l10n.t('Running');
    case 'waiting':
      return vscode.l10n.t('Waiting for input');
    case 'done':
      return vscode.l10n.t('Done');
    case 'failed':
      return vscode.l10n.t('Failed');
    case 'interrupted':
      return vscode.l10n.t('Interrupted');
  }
}

/** 左サイドバーのタスクの一覧。状態ごとのグループの下にタスクを並べる */
export class TaskTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly service: TaskService) {
    service.onDidChange(() => this.changed.fire(undefined));
    service.onDidDelete(() => this.changed.fire(undefined));
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (node === undefined) {
      const tasks = await this.service.list();
      return ORDER.flatMap((status) => {
        const group = tasks
          .filter((task) => task.status === status)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return group.length > 0 ? [{ kind: 'group', status, tasks: group }] : [];
      });
    }
    return node.kind === 'group' ? node.tasks.map((task) => ({ kind: 'task', task })) : [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(
        statusLabel(node.status),
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.description = String(node.tasks.length);
      item.contextValue = 'group';
      return item;
    }
    const { task } = node;
    const item = new vscode.TreeItem(task.title, vscode.TreeItemCollapsibleState.None);
    item.id = task.id;
    item.iconPath = new vscode.ThemeIcon(ICONS[task.status]);
    item.description = task.worktree === undefined ? task.model : task.worktree.branch;
    item.tooltip = task.turns[task.turns.length - 1]?.prompt;
    const flags = [task.status, isTurnOpen(task) ? 'open' : 'idle'];
    if (task.worktree !== undefined) {
      flags.push('worktree');
    }
    item.contextValue = flags.join(' ');
    item.command = {
      command: 'foreman.openTask',
      title: vscode.l10n.t('Open Task'),
      arguments: [task.id],
    };
    return item;
  }
}
