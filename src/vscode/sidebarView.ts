import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { TaskService } from '../app/taskService';
import { sidebarOf } from '../domain/sidebar';
import { contextUsage } from '../domain/usage';
import type { FromSidebar, SidebarState, ToSidebar } from '../webview/sidebarProtocol';
import { randomNonce } from './nonce';
import { statusLabel } from './statusLabel';

export interface SidebarViewDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  approvals: ApprovalService;
  activeTaskId: () => string | undefined;
  onDidChangeActive: (listener: () => void) => vscode.Disposable;
  openTask: (taskId: string) => Promise<void>;
  newTask: () => Promise<void>;
  now: () => string;
  onError: (error: unknown) => void;
}

export const SIDEBAR_VIEW_ID = 'foreman.tasks';

/** 左サイドバーの一覧（WebviewView）。実行中のタスクがあれば 1 分ごとに経過時間を描き直す */
export class SidebarView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: SidebarViewDeps) {
    this.subscriptions.push(
      { dispose: deps.service.onDidChange(() => void this.refresh()) },
      { dispose: deps.service.onDidDelete(() => void this.refresh()) },
      { dispose: deps.approvals.onDidChange(() => void this.refresh()) },
      deps.onDidChangeActive(() => void this.refresh())
    );
    this.timer = setInterval(() => void this.refresh(), 60_000);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.deps.extensionUri, 'dist')],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: FromSidebar) => {
      this.handle(message).catch(this.deps.onError);
    });
    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  private async handle(message: FromSidebar): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.refresh();
        return;
      case 'open':
        await this.deps.openTask(message.id);
        return;
      case 'newTask':
        await this.deps.newTask();
        return;
    }
  }

  private async refresh(): Promise<void> {
    if (this.view === undefined) {
      return;
    }
    const tasks = await this.deps.service.list();
    const pendingApproval = new Set(
      tasks.filter((task) => this.deps.approvals.pending(task.id) !== undefined).map((t) => t.id)
    );
    const activeTaskId = this.deps.activeTaskId();
    const active = tasks.find((task) => task.id === activeTaskId);
    const state: SidebarState = {
      groups: sidebarOf(tasks, { now: this.deps.now(), pendingApproval }),
      activeTaskId,
      context: active === undefined ? undefined : contextUsage(active),
      strings: {
        newTask: vscode.l10n.t('New task'),
        empty: vscode.l10n.t('No tasks yet. Create one to get started.'),
        groups: {
          waiting: statusLabel('waiting'),
          running: statusLabel('running'),
          review: statusLabel('review'),
          draft: statusLabel('draft'),
          done: statusLabel('done'),
        },
        badges: {
          approval: vscode.l10n.t('Approval'),
          replied: vscode.l10n.t('Replied'),
          failed: statusLabel('failed'),
          interrupted: statusLabel('interrupted'),
          done: statusLabel('done'),
          draft: statusLabel('draft'),
        },
        minutes: vscode.l10n.t('{0} min', '{0}'),
        files: vscode.l10n.t('{0} files', '{0}'),
        context: vscode.l10n.t('Context of this task'),
      },
    };
    const message: ToSidebar = { type: 'state', state };
    await this.view.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'sidebar.js')
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'sidebar.css')
    );
    const nonce = randomNonce();
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`,
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<link rel="stylesheet" href="${style.toString()}">`,
      '</head>',
      '<body>',
      `<script nonce="${nonce}" src="${script.toString()}"></script>`,
      '</body>',
      '</html>',
    ].join('\n');
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}
