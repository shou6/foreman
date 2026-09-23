import * as path from 'path';
import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { DiffService } from '../app/diffService';
import type { TaskService } from '../app/taskService';
import type { Transcripts } from '../app/transcripts';
import type { PermissionDecision } from '../domain/events';
import type { FileChange, Task } from '../domain/task';
import type { PanelState, ToExtension, ToWebview } from '../webview/protocol';
import { statusLabel } from './taskTreeView';

/** スナップショットを差分エディタに出すための URI スキーム */
export const SNAPSHOT_SCHEME = 'foreman-snapshot';

/** モデルの選択肢。設定や一覧に無いモデルは、指定されていれば選択肢に足す */
export const MODEL_PRESETS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];

export interface TaskPanelDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  transcripts: Transcripts;
  approvals: ApprovalService;
  diffs: DiffService;
}

/** タスク画面（WebviewPanel）。タスクごとに 1 つだけ開き、既に開いていれば前面に出す */
export class TaskPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** 次の指示に添付するファイル（タスクごと） */
  private readonly attachments = new Map<string, string[]>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly deps: TaskPanelDeps) {
    const { service, transcripts, approvals } = deps;
    this.subscriptions.push(
      { dispose: transcripts.onDidAppend((taskId, delta) => this.post(taskId, delta)) },
      {
        dispose: service.onDidChange((task) => {
          this.post(task.id, {
            type: 'task',
            status: task.status,
            title: task.title,
            model: task.model,
            activeModel: task.activeModel,
          });
          for (const turn of task.turns) {
            if (turn.changes.length > 0) {
              this.post(task.id, { type: 'changes', turn: turn.index, changes: turn.changes });
            }
          }
        }),
      },
      {
        dispose: approvals.onDidChange((taskId, pending) =>
          this.post(taskId, { type: 'pending', pending })
        ),
      },
      {
        dispose: service.onDidDelete((taskId) => {
          this.attachments.delete(taskId);
          this.panels.get(taskId)?.dispose();
        }),
      }
    );
  }

  async open(taskId: string): Promise<void> {
    const existing = this.panels.get(taskId);
    if (existing !== undefined) {
      existing.reveal();
      return;
    }
    const task = await this.deps.service.load(taskId);
    if (task === undefined) {
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'foreman.task',
      task.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.deps.extensionUri, 'dist')],
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

  /** ファイルを次の指示の添付に足す（FR-VIEW-5） */
  attach(taskId: string, files: string[]): void {
    const current = this.attachments.get(taskId) ?? [];
    const next = [...new Set([...current, ...files])];
    this.attachments.set(taskId, next);
    this.post(taskId, { type: 'attachments', paths: next });
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
          const task = await this.deps.service.load(taskId);
          if (task !== undefined) {
            this.post(taskId, { type: 'state', state: this.stateOf(task) });
          }
          return;
        }
        case 'send':
          this.attachments.delete(taskId);
          this.post(taskId, { type: 'attachments', paths: [] });
          await this.deps.service.send(taskId, message.prompt, message.attachments);
          return;
        case 'interrupt':
          await this.deps.service.stop(taskId);
          return;
        case 'decision':
          this.deps.approvals.decide(
            taskId,
            message.requestId,
            withDefaultReason(message.decision)
          );
          return;
        case 'showDiff': {
          const { lines } = await this.deps.diffs.diffOf(taskId, message.turn, message.path);
          this.post(taskId, { type: 'diff', turn: message.turn, path: message.path, lines });
          return;
        }
        case 'openDiff':
          await this.openDiffEditor(taskId, message.turn, message.path);
          return;
        case 'revert':
          await this.deps.diffs.revert(taskId, message.turn, message.path);
          return;
        case 'setModel':
          await this.deps.service.setModel(taskId, message.model);
          return;
        case 'dropped':
          this.attach(
            taskId,
            message.uris
              .map((u) => vscode.Uri.parse(u))
              .filter((u) => u.scheme === 'file')
              .map((u) => u.fsPath)
          );
          return;
        case 'removeAttachment': {
          const next = (this.attachments.get(taskId) ?? []).filter((p) => p !== message.path);
          this.attachments.set(taskId, next);
          this.post(taskId, { type: 'attachments', paths: next });
          return;
        }
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  /** VS Code の差分エディタで開く（FR-DIFF-4）。左が変更前、右が今のファイル */
  private async openDiffEditor(taskId: string, turn: number, file: string): Promise<void> {
    const task = await this.deps.service.load(taskId);
    const change = task?.turns[turn]?.changes.find((c) => c.path === file);
    if (task === undefined || change === undefined) {
      return;
    }
    const left = snapshotUri(file, change.before);
    const right =
      change.kind === 'deleted'
        ? snapshotUri(file, undefined)
        : vscode.Uri.file(path.join(task.cwd, file));
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      vscode.l10n.t('{0} (before ↔ current)', file)
    );
  }

  private stateOf(task: Task): PanelState {
    const changes: Record<number, FileChange[]> = {};
    for (const turn of task.turns) {
      if (turn.changes.length > 0) {
        changes[turn.index] = turn.changes;
      }
    }
    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      model: task.model,
      activeModel: task.activeModel,
      models: MODEL_PRESETS,
      items: this.deps.transcripts.get(task.id),
      pending: this.deps.approvals.pending(task.id),
      changes,
      diffs: {},
      attachments: this.attachments.get(task.id) ?? [],
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
        changes: vscode.l10n.t('Changes'),
        openDiff: vscode.l10n.t('Open in diff editor'),
        revert: vscode.l10n.t('Revert'),
        reverted: vscode.l10n.t('Reverted'),
        unknownBefore: vscode.l10n.t('Previous content unknown'),
        model: vscode.l10n.t('Model'),
        defaultModel: vscode.l10n.t('Default'),
        attachments: vscode.l10n.t('Attachments'),
        remove: vscode.l10n.t('Remove'),
        dropHint: vscode.l10n.t(
          'Type a follow-up (Ctrl+Enter to send). Drop files here to attach; hold Shift when dragging from the editor area.'
        ),
        statusLabels: {
          running: statusLabel('running'),
          waiting: statusLabel('waiting'),
          done: statusLabel('done'),
          failed: statusLabel('failed'),
          interrupted: statusLabel('interrupted'),
        },
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
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'webview.js')
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'webview.css')
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

/** スナップショットの URI。hash が無ければ空の内容（新規作成の前、削除の後） */
function snapshotUri(file: string, hash: string | undefined): vscode.Uri {
  return vscode.Uri.from({
    scheme: SNAPSHOT_SCHEME,
    path: '/' + file.replace(/\\/g, '/'),
    query: hash ?? '',
  });
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
