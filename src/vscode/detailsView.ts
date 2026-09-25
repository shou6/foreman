import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { DiffService } from '../app/diffService';
import type { TaskService } from '../app/taskService';
import type { ModelService } from '../app/modelService';
import { defaultModelName, modelLabel } from '../domain/models';
import { describeSuggestions } from '../domain/suggestions';
import { contextUsage } from '../domain/usage';
import { shortBranch } from '../domain/labels';
import { statusKindOf, type PendingKind } from '../domain/status';
import { canMerge, isTurnOpen, type Task } from '../domain/task';
import type {
  DetailsSession,
  DetailsState,
  FromDetails,
  ToDetails,
} from '../webview/detailsProtocol';
import { randomNonce } from './nonce';
import { readSettings } from './settings';
import { snapshotUri } from './snapshotUri';
import { pendingKinds, statusKindLabels } from './statusLabel';
import * as path from 'path';

export interface DetailsViewDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  approvals: ApprovalService;
  diffs: DiffService;
  /** 今見ているタスク（前面のタスク画面）。無ければ undefined */
  activeTaskId: () => string | undefined;
  onDidChangeActive: (listener: () => void) => vscode.Disposable;
  openTask: (taskId: string) => Promise<void>;
  openDiff: (taskId: string, turn: number, path: string) => Promise<void>;
  rewind: (taskId: string, turn: number) => Promise<void>;
  fork: (taskId: string, turn: number) => Promise<void>;
  merge: (taskId: string) => Promise<void>;
  discard: (taskId: string) => Promise<void>;
  onError: (error: unknown) => void;
  /** モデルの一覧（画面に出す名前に使う） */
  models: ModelService;
  /** 下の区画の高さを覚えておく場所 */
  dockHeight: { get(): number | undefined; set(height: number): Thenable<void> };
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
      { dispose: deps.approvals.onDidChange(() => void this.refresh()) },
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
    if (message.type === 'dockHeight') {
      await this.deps.dockHeight.set(message.height);
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
      case 'allDiff':
        await this.openAllDiff(taskId);
        return;
      case 'merge':
        await this.deps.merge(taskId);
        return;
      case 'discard':
        await this.deps.discard(taskId);
        return;
      case 'compact':
        await this.deps.service.compact(taskId);
        return;
      case 'mcpServers': {
        const servers = await this.deps.service.mcpServers(taskId);
        const reply: ToDetails = {
          type: 'mcp',
          mcp: servers === undefined ? { running: false } : { running: true, servers },
        };
        await this.view?.webview.postMessage(reply);
        return;
      }
    }
  }

  /** 全ターンの変更をファイルごとにまとめ、最初の変更前と今のファイルを複数ファイルの差分エディタで開く */
  private async openAllDiff(taskId: string): Promise<void> {
    const task = await this.deps.service.load(taskId);
    if (task === undefined) {
      return;
    }
    // 変更前の内容を消した後は、全体の差分を正しく出せない（全部が追加に見える）
    if (task.snapshotsPrunedAt !== undefined) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'Saved file contents were removed after the retention period. Diffs and revert are no longer available.'
        )
      );
      return;
    }
    const first = new Map<string, { before: string | undefined; deleted: boolean }>();
    for (const turn of task.turns) {
      for (const change of turn.changes) {
        const entry = first.get(change.path);
        if (entry === undefined) {
          first.set(change.path, { before: change.before, deleted: change.kind === 'deleted' });
        } else {
          entry.deleted = change.kind === 'deleted';
        }
      }
    }
    if (first.size === 0) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No changes yet'));
      return;
    }
    const resources = [...first.entries()].map(([file, entry]) => [
      vscode.Uri.file(path.join(task.cwd, file)),
      snapshotUri(file, entry.before),
      entry.deleted ? snapshotUri(file, undefined) : vscode.Uri.file(path.join(task.cwd, file)),
    ]);
    await vscode.commands.executeCommand(
      'vscode.changes',
      vscode.l10n.t('{0}: all changes', task.title),
      resources
    );
  }

  private async refresh(): Promise<void> {
    if (this.view === undefined) {
      return;
    }
    const taskId = this.deps.activeTaskId();
    const task = taskId === undefined ? undefined : await this.deps.service.load(taskId);
    const pending =
      task === undefined
        ? undefined
        : pendingKinds([task], (id) => this.deps.approvals.pending(id)).get(task.id);
    const state: DetailsState = {
      task:
        task === undefined
          ? undefined
          : detailsOf(task, pending, readSettings().worktreeBranchPrefix),
      session: task === undefined ? undefined : this.sessionOf(task),
      dockHeight: this.deps.dockHeight.get(),
      locale: vscode.env.language,
      strings: {
        noTask: vscode.l10n.t('Open a task to see its changes here.'),
        turn: vscode.l10n.t('Turn {0}', '{0}'),
        openDiff: vscode.l10n.t('Open diff'),
        revert: vscode.l10n.t('Revert'),
        reverted: vscode.l10n.t('Reverted'),
        rewindHere: vscode.l10n.t('Rewind to here'),
        forkHere: vscode.l10n.t('Fork from here'),
        noChanges: vscode.l10n.t('No changes'),
        none: vscode.l10n.t('None'),
        statusLabels: statusKindLabels(),
        changesTitle: vscode.l10n.t('Changes in this task'),
        finish: vscode.l10n.t('Finish'),
        allDiff: vscode.l10n.t('Whole diff'),
        merge: vscode.l10n.t('Merge into {0}', '{0}'),
        discardWorktree: vscode.l10n.t('Discard worktree…'),
        stepApproved: vscode.l10n.t('Changes approved ({0} turns · {1} files)', '{0}', '{1}'),
        stepApprove: vscode.l10n.t('Approve the changes'),
        stepReview: vscode.l10n.t('Review the whole diff'),
        stepMerge: vscode.l10n.t('Bring the changes into {0}', '{0}'),
        endWithoutMerge: vscode.l10n.t('End without merging'),
        endWithoutChanges: vscode.l10n.t('End without keeping anything'),
        nothingToMerge: vscode.l10n.t('Nothing to merge'),
        nothingToMergeHint: vscode.l10n.t(
          'No files have changed in this task yet. Once there are changes, approve them to merge from here.'
        ),
        snapshotsPruned: vscode.l10n.t(
          'Saved file contents were removed after the retention period. Diffs and revert are no longer available.'
        ),
        today: vscode.l10n.t('Today'),
        yesterday: vscode.l10n.t('Yesterday'),
        overview: vscode.l10n.t('Overview'),
        mcpTab: vscode.l10n.t('MCP'),
        alwaysAllowedTab: vscode.l10n.t('Always allowed {0}', '{0}'),
        context: vscode.l10n.t('Context'),
        model: vscode.l10n.t('Model'),
        effort: vscode.l10n.t('Effort'),
        permissionMode: vscode.l10n.t('Permission mode'),
        directory: vscode.l10n.t('Directory'),
        compact: vscode.l10n.t('Compact the context'),
        refresh: vscode.l10n.t('Refresh'),
        resizeDock: vscode.l10n.t('Drag to resize'),
        mcpNotRunning: vscode.l10n.t('Shown while Claude Code is running for this task'),
        mcpStatus: {
          connected: vscode.l10n.t('Connected'),
          failed: vscode.l10n.t('Failed'),
          'needs-auth': vscode.l10n.t('Needs authentication'),
          pending: vscode.l10n.t('Connecting'),
          disabled: vscode.l10n.t('Disabled'),
        },
      },
    };
    const message: ToDetails = { type: 'state', state };
    await this.view.webview.postMessage(message);
  }

  /** 下の区画に出すセッションの情報。モデルと Effort は画面に出す名前にする */
  private sessionOf(task: Task): DetailsSession {
    const usage = contextUsage(task);
    const list = this.deps.models.current();
    const name = task.activeModel ?? task.model;
    const fallback = defaultModelName(list.defaultModel);
    const effort = task.activeEffort ?? task.effort;
    const efforts = {
      low: vscode.l10n.t('Low'),
      medium: vscode.l10n.t('Medium'),
      high: vscode.l10n.t('High'),
      xhigh: vscode.l10n.t('Extra high'),
      max: vscode.l10n.t('Max'),
    };
    return {
      usage,
      canCompact: usage !== undefined && !isTurnOpen(task),
      model:
        name !== undefined
          ? modelLabel(name, list.models)
          : fallback !== undefined
            ? vscode.l10n.t('Default ({0})', fallback)
            : vscode.l10n.t('Default'),
      effort: effort === undefined ? undefined : efforts[effort],
      permissionMode: task.permissionMode,
      cwd: task.cwd,
      alwaysAllowed: describeSuggestions(task.alwaysAllowed),
    };
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'details.js')
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'details.css')
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
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}

/** タスクから右サイドバーに要る分だけを取り出す */
export function detailsOf(
  task: Task,
  pending: PendingKind | undefined,
  branchPrefix: string | undefined
): DetailsState['task'] {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    kind: statusKindOf(task.status, isTurnOpen(task), pending),
    turnOpen: isTurnOpen(task),
    mergeable: canMerge(task),
    snapshotsPruned: task.snapshotsPrunedAt !== undefined,
    worktree:
      task.worktree === undefined
        ? undefined
        : { branch: shortBranch(task.worktree.branch, branchPrefix), base: task.worktree.base },
    turns: task.turns.map((turn) => ({
      index: turn.index,
      prompt: turn.prompt,
      ok: turn.result?.ok,
      startedAt: turn.startedAt,
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
