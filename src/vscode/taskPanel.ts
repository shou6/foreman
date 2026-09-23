import * as path from 'path';
import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { DiffService } from '../app/diffService';
import type { TaskService } from '../app/taskService';
import type { Transcripts } from '../app/transcripts';
import type { PermissionDecision } from '../domain/events';
import type { FileChange, Task } from '../domain/task';
import type { PanelState, ToExtension, ToWebview } from '../webview/protocol';
import { readSettings } from './settings';
import { attachmentKey, uniqueAttachments, type Attachment } from '../domain/attachments';
import { canMerge, isTurnOpen } from '../domain/task';
import { contextUsage, turnTokens, type TurnTokens } from '../domain/usage';
import { randomNonce } from './nonce';
import { statusLabel } from './statusLabel';
import { snapshotUri } from './snapshotUri';

/** スナップショットを差分エディタに出すための URI スキーム */

/** モデルの選択肢。設定や一覧に無いモデルは、指定されていれば選択肢に足す */
export const MODEL_PRESETS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];

export interface TaskPanelDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  transcripts: Transcripts;
  approvals: ApprovalService;
  diffs: DiffService;
  /** worktree のマージと破棄（確認や後始末は呼ぶ側が行う） */
  finish: { merge(taskId: string): Promise<void>; discard(taskId: string): Promise<void> };
  /** タスクを Markdown に書き出す */
  exportTask: (taskId: string) => Promise<void>;
  /** 貼り付けた画像を保存して、そのパスを返す */
  savePastedImage: (mime: string, base64: string) => Promise<string>;
  /** チェックポイントに戻す / そこから切り出す（確認は呼ぶ側が行う） */
  /** レビュー待ちの承認（変更を確認済みにして完了にする） */
  approve: (taskId: string) => Promise<void>;
  /** 「渡すもの」の材料 */
  sources: {
    selection(): Attachment | undefined;
    diagnostics(): Attachment | undefined;
    gitDiff(cwd: string): Promise<Attachment | undefined>;
    pickFiles(): Promise<Attachment[]>;
  };
  checkpoint: {
    rewind(taskId: string, turn: number): Promise<void>;
    fork(taskId: string, turn: number): Promise<void>;
  };
}

/** タスク画面（WebviewPanel）。タスクごとに 1 つだけ開き、既に開いていれば前面に出す */
export class TaskPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** 次の指示に添付するファイル（タスクごと） */
  private readonly attachments = new Map<string, Attachment[]>();
  private readonly subscriptions: vscode.Disposable[] = [];
  /** 前面に出ているタスク画面のタスク。右サイドバーが追う */
  private active: string | undefined;
  private readonly activeChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeActive = this.activeChanged.event;

  /** 今見ているタスク。無ければ undefined */
  get activeTaskId(): string | undefined {
    return this.active;
  }

  constructor(private readonly deps: TaskPanelDeps) {
    const { service, transcripts, approvals } = deps;
    this.subscriptions.push(
      { dispose: transcripts.onDidAppend((taskId, delta) => this.post(taskId, delta)) },
      {
        dispose: service.onDidChange((task) => {
          this.post(task.id, {
            type: 'task',
            status: task.status,
            turnOpen: isTurnOpen(task),
            mergeable: canMerge(task),
            usage: contextUsage(task),
            tokens: tokensOf(task),
            title: task.title,
            model: task.model,
            activeModel: task.activeModel,
            worktree: task.worktree,
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
        // 別のタブに移っても、入力の途中や開いた差分をそのまま残す
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.deps.extensionUri, 'dist')],
      }
    );
    panel.iconPath = new vscode.ThemeIcon('tasklist');
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: ToExtension) => {
      void this.handle(taskId, message);
    });
    panel.onDidDispose(() => {
      this.panels.delete(taskId);
      if (this.active === taskId) {
        this.setActive(undefined);
      }
    });
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (webviewPanel.active) {
        this.setActive(taskId);
      }
    });
    this.panels.set(taskId, panel);
    this.setActive(taskId);
  }

  private setActive(taskId: string | undefined): void {
    if (this.active !== taskId) {
      this.active = taskId;
      this.activeChanged.fire();
    }
  }

  /** ファイルを次の指示の添付に足す（FR-VIEW-5） */
  attach(taskId: string, items: Attachment[]): void {
    const current = this.attachments.get(taskId) ?? [];
    const next = uniqueAttachments([...current, ...items]);
    this.attachments.set(taskId, next);
    this.post(taskId, { type: 'attachments', attachments: next });
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
          this.post(taskId, { type: 'attachments', attachments: [] });
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
          await this.openDiff(taskId, message.turn, message.path);
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
              .map((u) => ({ kind: 'file', path: u.fsPath }))
          );
          return;
        case 'pasteImage': {
          const file = await this.deps.savePastedImage(message.mime, message.data);
          this.attach(taskId, [{ kind: 'file', path: file }]);
          return;
        }
        case 'attachSelection': {
          const item = this.deps.sources.selection();
          if (item !== undefined) {
            this.attach(taskId, [item]);
          }
          return;
        }
        case 'attachDiagnostics': {
          const item = this.deps.sources.diagnostics();
          if (item !== undefined) {
            this.attach(taskId, [item]);
          }
          return;
        }
        case 'attachGitDiff': {
          const task = await this.deps.service.load(taskId);
          const item = task === undefined ? undefined : await this.deps.sources.gitDiff(task.cwd);
          if (item !== undefined) {
            this.attach(taskId, [item]);
          }
          return;
        }
        case 'pickFiles':
          this.attach(taskId, await this.deps.sources.pickFiles());
          return;
        case 'merge':
        case 'discard':
          this.post(taskId, { type: 'finishing', kind: message.type });
          try {
            await (message.type === 'merge'
              ? this.deps.finish.merge(taskId)
              : this.deps.finish.discard(taskId));
          } finally {
            this.post(taskId, { type: 'finishing', kind: undefined });
          }
          return;
        case 'export':
          await this.deps.exportTask(taskId);
          return;
        case 'rewind':
          await this.deps.checkpoint.rewind(taskId, message.turn);
          return;
        case 'fork':
          await this.deps.checkpoint.fork(taskId, message.turn);
          return;
        case 'approve':
          await this.deps.approve(taskId);
          return;
        case 'revertAll': {
          const skipped = await this.deps.diffs.revertAfter(taskId, message.turn - 1);
          if (skipped.length > 0) {
            void vscode.window.showWarningMessage(
              vscode.l10n.t(
                '{0} file(s) could not be reverted because their previous content is unknown: {1}',
                String(skipped.length),
                skipped.join(', ')
              )
            );
          }
          return;
        }
        case 'removeAttachment': {
          const next = (this.attachments.get(taskId) ?? []).filter(
            (a) => attachmentKey(a) !== message.key
          );
          this.attachments.set(taskId, next);
          this.post(taskId, { type: 'attachments', attachments: next });
          return;
        }
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  /** VS Code の差分エディタで開く（FR-DIFF-4）。左が変更前、右が今のファイル */
  /** 変更前（スナップショット）と今のファイルを差分エディタで開く */
  async openDiff(taskId: string, turn: number, file: string): Promise<void> {
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
      turnOpen: isTurnOpen(task),
      mergeable: canMerge(task),
      usage: contextUsage(task),
      tokens: tokensOf(task),
      model: task.model,
      activeModel: task.activeModel,
      models: MODEL_PRESETS,
      items: this.deps.transcripts.get(task.id),
      pending: this.deps.approvals.pending(task.id),
      changes,
      diffs: {},
      attachments: this.attachments.get(task.id) ?? [],
      maxWidthEm: readSettings().taskViewWidth,
      worktree: task.worktree,
      toolCallsExpanded: readSettings().toolCallsExpanded,
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
        changes: vscode.l10n.t('Changes in this turn'),
        files: vscode.l10n.t('files'),
        openDiff: vscode.l10n.t('Open diff'),
        revert: vscode.l10n.t('Revert'),
        reverted: vscode.l10n.t('Reverted'),
        unknownBefore: vscode.l10n.t('Previous content unknown'),
        model: vscode.l10n.t('Model'),
        defaultModel: vscode.l10n.t('Default'),
        attachments: vscode.l10n.t('Attachments'),
        remove: vscode.l10n.t('Remove'),
        pass: vscode.l10n.t('Pass along'),
        selection: vscode.l10n.t('Selection'),
        diagnostics: vscode.l10n.t('Diagnostics'),
        gitDiff: vscode.l10n.t('git diff'),
        addFile: vscode.l10n.t('+ File'),
        dropHint: vscode.l10n.t(
          'Type a follow-up (Ctrl+Enter to send). Drop files here to attach; hold Shift when dragging from the editor area.'
        ),
        statusLabels: {
          draft: statusLabel('draft'),
          running: statusLabel('running'),
          waiting: statusLabel('waiting'),
          review: statusLabel('review'),
          done: statusLabel('done'),
          failed: statusLabel('failed'),
          interrupted: statusLabel('interrupted'),
        },
        worktree: vscode.l10n.t('worktree'),
        merge: vscode.l10n.t('Merge into {0}', '{0}'),
        discard: vscode.l10n.t('Discard'),
        toolCalls: vscode.l10n.t('{0} tool calls', '{0}'),
        export: vscode.l10n.t('Export'),
        merging: vscode.l10n.t('Merging…'),
        discarding: vscode.l10n.t('Discarding…'),
        alwaysScope: vscode.l10n.t('"Always allow" would allow'),
        turn: vscode.l10n.t('Turn {0}', '{0}'),
        rewindHere: vscode.l10n.t('Rewind to here'),
        forkHere: vscode.l10n.t('Fork from here'),
        approve: vscode.l10n.t('Approve'),
        markDone: vscode.l10n.t('Mark as done'),
        revertAll: vscode.l10n.t('Revert all'),
        contextUsage: vscode.l10n.t('Context'),
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

/** 拒否の理由が空なら、既定の文言を Claude に返す */
function withDefaultReason(decision: PermissionDecision): PermissionDecision {
  if (decision.behavior === 'deny' && decision.message.trim() === '') {
    return { behavior: 'deny', message: vscode.l10n.t('Denied by the user in Foreman.') };
  }
  return decision;
}

/** ターンの番号 → トークン数。結果の無いターンは含めない */
function tokensOf(task: Task): Record<number, TurnTokens> {
  const tokens: Record<number, TurnTokens> = {};
  for (const turn of task.turns) {
    const t = turnTokens(turn);
    if (t !== undefined) {
      tokens[turn.index] = t;
    }
  }
  return tokens;
}
