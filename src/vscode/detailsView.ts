import * as vscode from 'vscode';
import type { DiffService } from '../app/diffService';
import type { TaskService } from '../app/taskService';
import type { Task } from '../domain/task';
import type { DetailsState, FromDetails, ToDetails } from '../webview/detailsProtocol';
import { randomNonce } from './nonce';
import { statusLabel } from './taskTreeView';

export interface DetailsViewDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  diffs: DiffService;
  /** 今見ているタスク（前面のタスク画面）。無ければ undefined */
  activeTaskId: () => string | undefined;
  onDidChangeActive: (listener: () => void) => vscode.Disposable;
  openTask: (taskId: string) => Promise<void>;
  openDiff: (taskId: string, turn: number, path: string) => Promise<void>;
  rewind: (taskId: string, turn: number) => Promise<void>;
  fork: (taskId: string, turn: number) => Promise<void>;
  onError: (error: unknown) => void;
}

export const DETAILS_VIEW_ID = 'foreman.details';

/** 右サイドバー（WebviewView）。前面のタスク画面のタスクの変更とチェックポイントを出す */
export class DetailsView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly deps: DetailsViewDeps) {
    this.subscriptions.push(
      { dispose: deps.service.onDidChange(() => void this.refresh()) },
      { dispose: deps.service.onDidDelete(() => void this.refresh()) },
      deps.onDidChangeActive(() => void this.refresh())
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.deps.extensionUri, 'dist')],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: FromDetails) => {
      this.handle(message).catch(this.deps.onError);
    });
    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  private async handle(message: FromDetails): Promise<void> {
    const taskId = this.deps.activeTaskId();
    if (message.type === 'ready') {
      await this.refresh();
      return;
    }
    if (taskId === undefined) {
      return;
    }
    switch (message.type) {
      case 'open':
        await this.deps.openTask(taskId);
        return;
      case 'openDiff':
        await this.deps.openDiff(taskId, message.turn, message.path);
        return;
      case 'revert':
        await this.deps.diffs.revert(taskId, message.turn, message.path);
        return;
      case 'rewind':
        await this.deps.rewind(taskId, message.turn);
        return;
      case 'fork':
        await this.deps.fork(taskId, message.turn);
        return;
    }
  }

  private async refresh(): Promise<void> {
    if (this.view === undefined) {
      return;
    }
    const taskId = this.deps.activeTaskId();
    const task = taskId === undefined ? undefined : await this.deps.service.load(taskId);
    const state: DetailsState = {
      task: task === undefined ? undefined : detailsOf(task),
      strings: {
        noTask: vscode.l10n.t('Open a task to see its changes here.'),
        changes: vscode.l10n.t('Changes'),
        checkpoints: vscode.l10n.t('Checkpoints'),
        turn: vscode.l10n.t('Turn {0}', '{0}'),
        openDiff: vscode.l10n.t('Open diff'),
        revert: vscode.l10n.t('Revert'),
        reverted: vscode.l10n.t('Reverted'),
        rewindHere: vscode.l10n.t('Rewind to here'),
        forkHere: vscode.l10n.t('Fork from here'),
        noChanges: vscode.l10n.t('No changes yet'),
        statusLabels: {
          draft: statusLabel('draft'),
          running: statusLabel('running'),
          waiting: statusLabel('waiting'),
          review: statusLabel('review'),
          done: statusLabel('done'),
          failed: statusLabel('failed'),
          interrupted: statusLabel('interrupted'),
        },
      },
    };
    const message: ToDetails = { type: 'state', state };
    await this.view.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'details.js')
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'details.css')
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
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}

/** タスクから右サイドバーに要る分だけを取り出す */
export function detailsOf(task: Task): DetailsState['task'] {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    turns: task.turns.map((turn) => ({
      index: turn.index,
      prompt: turn.prompt,
      ok: turn.result?.ok,
      changes: turn.changes.map((change) => ({
        path: change.path,
        kind: change.kind,
        added: change.added,
        removed: change.removed,
        reverted: change.reverted,
      })),
    })),
  };
}
