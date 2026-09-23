import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { TaskService } from '../app/taskService';
import type { Transcripts } from '../app/transcripts';
import type { PermissionDecision } from '../domain/events';
import type { Task } from '../domain/task';
import type { PanelState, ToExtension, ToWebview } from '../webview/protocol';

/** タスク画面（WebviewPanel）。タスクごとに 1 つだけ開き、既に開いていれば前面に出す */
export class TaskPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: TaskService,
    private readonly transcripts: Transcripts,
    private readonly approvals: ApprovalService
  ) {
    this.subscriptions.push(
      { dispose: transcripts.onDidAppend((taskId, delta) => this.post(taskId, delta)) },
      {
        dispose: service.onDidChange((task) =>
          this.post(task.id, {
            type: 'task',
            status: task.status,
            title: task.title,
            model: task.model,
          })
        ),
      },
      {
        dispose: approvals.onDidChange((taskId, pending) =>
          this.post(taskId, { type: 'pending', pending })
        ),
      },
      { dispose: service.onDidDelete((taskId) => this.panels.get(taskId)?.dispose()) }
    );
  }

  async open(taskId: string): Promise<void> {
    const existing = this.panels.get(taskId);
    if (existing !== undefined) {
      existing.reveal();
      return;
    }
    const task = await this.service.load(taskId);
    if (task === undefined) {
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'foreman.task',
      task.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
      }
    );
    panel.iconPath = new vscode.ThemeIcon('tasklist');
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: ToExtension) => {
      void this.handle(taskId, message);
    });
    panel.onDidDispose(() => this.panels.delete(taskId));
    this.panels.set(taskId, panel);
  }

  dispose(): void {
    for (const s of this.subscriptions) {
      s.dispose();
    }
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
  }

  private async handle(taskId: string, message: ToExtension): Promise<void> {
    try {
      switch (message.type) {
        case 'ready': {
          const task = await this.service.load(taskId);
          if (task !== undefined) {
            this.post(taskId, { type: 'state', state: this.stateOf(task) });
          }
          return;
        }
        case 'send':
          await this.service.send(taskId, message.prompt);
          return;
        case 'interrupt':
          await this.service.stop(taskId);
          return;
        case 'decision':
          this.approvals.decide(taskId, message.requestId, withDefaultReason(message.decision));
          return;
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private stateOf(task: Task): PanelState {
    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      model: task.model,
      items: this.transcripts.get(task.id),
      pending: this.approvals.pending(task.id),
      strings: {
        send: vscode.l10n.t('Send'),
        stop: vscode.l10n.t('Stop'),
        running: vscode.l10n.t('Running…'),
        allow: vscode.l10n.t('Allow'),
        allowAlways: vscode.l10n.t('Always allow in this task'),
        deny: vscode.l10n.t('Deny'),
        denyReason: vscode.l10n.t('Reason (optional)'),
        answer: vscode.l10n.t('Answer'),
        waiting: vscode.l10n.t('Waiting for your input'),
      },
    };
  }

  private post(taskId: string, message: ToWebview): void {
    const panel = this.panels.get(taskId);
    if (panel !== undefined) {
      if (message.type === 'task') {
        panel.title = message.title;
      }
      void panel.webview.postMessage(message);
    }
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css')
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
}

/** 拒否の理由が空なら、既定の文言を Claude に返す */
function withDefaultReason(decision: PermissionDecision): PermissionDecision {
  if (decision.behavior === 'deny' && decision.message.trim() === '') {
    return { behavior: 'deny', message: vscode.l10n.t('Denied by the user in Foreman.') };
  }
  return decision;
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
