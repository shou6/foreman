import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { TaskService } from '../app/taskService';
import { boardOf, moveAllowed, type BoardColumnKey } from '../domain/board';
import { isTurnOpen } from '../domain/task';
import type { BoardState, FromBoard, ToBoard } from '../webview/boardProtocol';
import { randomNonce } from './nonce';
import { readSettings } from './settings';
import { pendingKinds, statusKindLabels, statusLabel, yourTurnLabel } from './statusLabel';

export interface BoardPanelDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  approvals: ApprovalService;
  openTask: (taskId: string) => Promise<void>;
  newDraft: () => Promise<void>;
  start: (taskId: string) => Promise<void>;
  approve: (taskId: string) => Promise<void>;
  onError: (error: unknown) => void;
  now: () => string;
}

/** タスクボード（WebviewPanel）。1 つだけ開き、タスクの変化で描き直す */
export class BoardPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly subscriptions: (() => void)[] = [];

  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly deps: BoardPanelDeps) {
    this.subscriptions.push(
      deps.service.onDidChange(() => void this.refresh()),
      deps.service.onDidDelete(() => void this.refresh()),
      deps.approvals.onDidChange(() => void this.refresh())
    );
    // 実行中の経過時間を進める
    this.timer = setInterval(() => void this.refresh(), 60_000);
  }

  open(): void {
    if (this.panel !== undefined) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'foreman.board',
      vscode.l10n.t('Task Board'),
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = vscode.Uri.joinPath(this.deps.extensionUri, 'resources', 'activity.svg');
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: FromBoard) => {
      this.handle(message).catch(this.deps.onError);
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel = panel;
    // ピン留めしたタブは常に左端に並ぶ
    void vscode.commands.executeCommand('workbench.action.pinEditor');
  }

  private async handle(message: FromBoard): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.refresh();
        return;
      case 'open':
        await this.deps.openTask(message.id);
        return;
      case 'newDraft':
        await this.deps.newDraft();
        return;
      case 'start':
        await this.deps.start(message.id);
        return;
      case 'approve':
        await this.deps.approve(message.id);
        return;
      case 'stop':
        await this.deps.service.stop(message.id);
        return;
      case 'move':
        await this.move(message.id, message.to);
        return;
      case 'reorder':
        await this.deps.service.reorder(message.ids);
        return;
    }
  }

  private async move(taskId: string, to: BoardColumnKey): Promise<void> {
    const task = await this.deps.service.load(taskId);
    if (task === undefined) {
      return;
    }
    const action = moveAllowed(task.status, to, isTurnOpen(task));
    if (action === 'start') {
      await this.deps.start(taskId);
    } else if (action === 'approve') {
      await this.deps.approve(taskId);
    } else {
      // 許されない移動は元に戻す（描き直す）
      await this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    if (this.panel === undefined) {
      return;
    }
    const tasks = await this.deps.service.list();
    const labels = statusKindLabels();
    const state: BoardState = {
      columns: boardOf(tasks, {
        now: this.deps.now(),
        pending: pendingKinds(tasks, (id) => this.deps.approvals.pending(id)),
        branchPrefix: readSettings().worktreeBranchPrefix,
      }),
      strings: {
        columns: {
          draft: statusLabel('draft'),
          running: statusLabel('running'),
          waiting: yourTurnLabel(),
          review: statusLabel('review'),
          done: statusLabel('done'),
        },
        badges: {
          approval: labels.approval,
          question: labels.question,
          replied: labels.replied,
          failed: labels.failed,
          interrupted: labels.interrupted,
        },
        newDraft: vscode.l10n.t('New draft'),
        start: vscode.l10n.t('Start'),
        stop: vscode.l10n.t('Stop'),
        open: vscode.l10n.t('Open'),
        markDone: vscode.l10n.t('Mark as done'),
        approveAndDone: vscode.l10n.t('Approve and finish'),
        files: vscode.l10n.t('{0} files', '{0}'),
        empty: vscode.l10n.t('No tasks'),
        emptyDone: vscode.l10n.t('Drag reviewed cards here to finish them'),
        minutes: vscode.l10n.t('{0} min', '{0}'),
      },
    };
    const message: ToBoard = { type: 'state', state };
    await this.panel.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'board.js')
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'board.css')
    );
    const codicons = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'codicon.css')
    );
    const nonce = randomNonce();
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`,
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<link rel="stylesheet" href="${codicons.toString()}">`,
      `<link rel="stylesheet" href="${style.toString()}">`,
      '</head>',
      '<body>',
      `<script nonce="${nonce}" src="${script.toString()}"></script>`,
      '</body>',
      '</html>',
    ].join('\n');
  }

  dispose(): void {
    clearInterval(this.timer);
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.panel?.dispose();
  }
}
