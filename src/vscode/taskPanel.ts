import * as path from 'path';
import * as vscode from 'vscode';
import type { ApprovalService } from '../app/approvalService';
import type { DiffService } from '../app/diffService';
import type { CommandService } from '../app/commandService';
import type { ModelService } from '../app/modelService';
import type { TaskService } from '../app/taskService';
import type { Transcripts } from '../app/transcripts';
import type { PermissionDecision } from '../domain/events';
import type { FileChange, Task } from '../domain/task';
import type { PanelState, ToExtension, ToWebview } from '../webview/protocol';
import { readSettings } from './settings';
import { attachmentKey, uniqueAttachments, type Attachment } from '../domain/attachments';
import { canMerge, canUnapprove, isTurnOpen } from '../domain/task';
import { contextUsage, turnTokens, type TurnTokens } from '../domain/usage';
import { describeSuggestions } from '../domain/suggestions';
import { randomNonce } from './nonce';
import { statusKindLabels } from './statusLabel';
import { snapshotUri } from './snapshotUri';
import { taskPanelCsp } from '../webview/csp';

/** スナップショットを差分エディタに出すための URI スキーム */

export interface TaskPanelDeps {
  extensionUri: vscode.Uri;
  service: TaskService;
  transcripts: Transcripts;
  approvals: ApprovalService;
  diffs: DiffService;
  /** モデルの選択肢（Claude Code から取得して覚えておく） */
  models: ModelService;
  /** Claude Code のコマンドとスキル（取得して覚えておく） */
  commands: CommandService;
  /** worktree のマージと破棄（確認や後始末は呼ぶ側が行う） */
  finish: { merge(taskId: string): Promise<void>; discard(taskId: string): Promise<void> };
  /** タスクを Markdown に書き出す */
  exportTask: (taskId: string) => Promise<void>;
  /** タスク名の変更（入力のダイアログを含む） */
  renameTask: (taskId: string) => Promise<void>;
  /** 見出しの「…」。ほかの操作を選んで実行する */
  moreActions: (taskId: string) => Promise<void>;
  /** 貼り付けた画像を保存して、そのパスを返す */
  savePastedImage: (mime: string, base64: string) => Promise<string>;
  /** 計画をエディターの別のタブで開く */
  openPlan: (taskId: string, plan: string) => Promise<void>;
  /** チェックポイントに戻す / そこから切り出す（確認は呼ぶ側が行う） */
  /** レビュー待ちの承認（変更を確認済みにして完了にする） */
  approve: (taskId: string) => Promise<void>;
  /** 承認の取り消し（承認の前の状態に戻す） */
  unapprove: (taskId: string) => Promise<void>;
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
            turnStartedAt: task.turns[task.turns.length - 1]?.startedAt,
            turnTimes: turnTimesOf(task),
            mergeable: canMerge(task),
            unapprovable: canUnapprove(task),
            usage: contextUsage(task),
            tokens: tokensOf(task),
            title: task.title,
            model: task.model,
            activeModel: task.activeModel,
            effort: task.effort,
            activeEffort: task.activeEffort,
            permissionMode: task.permissionMode,
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
        // 一覧を取得し終えたら、開いているタスク画面の選択肢を入れ替える
        dispose: deps.models.onDidChange(() => {
          const { models, defaultModel } = deps.models.current();
          for (const taskId of this.panels.keys()) {
            this.post(taskId, { type: 'models', models, defaultModel });
          }
        }),
      },
      {
        dispose: deps.commands.onDidChange(() => {
          for (const taskId of this.panels.keys()) {
            this.post(taskId, { type: 'commands', commands: deps.commands.current() });
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
        case 'setEffort':
          await this.deps.service.setEffort(taskId, message.effort);
          return;
        case 'setPermissionMode':
          await this.deps.service.setPermissionMode(taskId, message.mode);
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
        case 'rename':
          await this.deps.renameTask(taskId);
          return;
        case 'more':
          await this.deps.moreActions(taskId);
          return;
        case 'showSession':
          // 右サイドバーの区画（ビュー）を前面に出す。VS Code がビューごとに作るコマンド
          await vscode.commands.executeCommand('foreman.details.focus');
          return;
        case 'openPlan':
          await this.deps.openPlan(taskId, message.plan);
          return;
        case 'compact':
          await this.deps.service.compact(taskId);
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
        case 'unapprove':
          await this.deps.unapprove(taskId);
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
      turnStartedAt: task.turns[task.turns.length - 1]?.startedAt,
      turnTimes: turnTimesOf(task),
      locale: vscode.env.language,
      mergeable: canMerge(task),
      unapprovable: canUnapprove(task),
      usage: contextUsage(task),
      tokens: tokensOf(task),
      model: task.model,
      activeModel: task.activeModel,
      effort: task.effort,
      activeEffort: task.activeEffort,
      permissionMode: task.permissionMode,
      models: this.deps.models.current().models,
      commands: this.deps.commands.current(),
      defaultModel: this.deps.models.current().defaultModel,
      items: this.deps.transcripts.get(task.id),
      pending: this.deps.approvals.pending(task.id),
      changes,
      diffs: {},
      attachments: this.attachments.get(task.id) ?? [],
      maxWidthEm: readSettings().taskViewWidth,
      worktree: task.worktree,
      toolCallsExpanded: readSettings().toolCallsExpanded,
      thinking: readSettings().thinking,
      presets: readSettings().presets,
      context: {
        cwd: task.cwd,
        permissionMode: task.permissionMode,
        alwaysAllowed: describeSuggestions(task.alwaysAllowed),
      },
      strings: {
        send: vscode.l10n.t('Send'),
        stop: vscode.l10n.t('Stop'),
        runningTurn: vscode.l10n.t('Turn {0} running · {1}', '{0}', '{1}'),
        elapsedSeconds: vscode.l10n.t('{0}s', '{0}'),
        elapsedMinutes: vscode.l10n.t('{0}m {1}s', '{0}', '{1}'),
        today: vscode.l10n.t('Today'),
        yesterday: vscode.l10n.t('Yesterday'),
        allow: vscode.l10n.t('Allow'),
        allowAlways: vscode.l10n.t('Always allow'),
        alwaysScope: vscode.l10n.t('Always allow covers: {0}', '{0}'),
        deny: vscode.l10n.t('Deny…'),
        denyConfirm: vscode.l10n.t('Deny'),
        denyReason: vscode.l10n.t('Reason (optional)'),
        approvalTitles: {
          command: vscode.l10n.t('Run this command?'),
          edit: vscode.l10n.t('Edit this file?'),
          web: vscode.l10n.t('Access the web?'),
          other: vscode.l10n.t('Use {0}?', '{0}'),
          plan: vscode.l10n.t('Approve the plan and start?'),
        },
        approvePlan: vscode.l10n.t('Approve and implement'),
        openPlan: vscode.l10n.t('Open in editor'),
        showSession: vscode.l10n.t('Session'),
        planMode: vscode.l10n.t('Plan only'),
        planModeHint: vscode.l10n.t('Claude reads and plans, and asks before it edits'),
        inputDetails: vscode.l10n.t('Input details (JSON)'),
        answer: vscode.l10n.t('Answer'),
        other: vscode.l10n.t('Other (write your own)'),
        otherPlaceholder: vscode.l10n.t('Your answer'),
        questionKeys: vscode.l10n.t('Press 1–{0} to choose, Enter to answer', '{0}'),
        questionTabKeys: vscode.l10n.t('Press 1–{0} to choose, ←/→ to switch questions', '{0}'),
        submitTab: vscode.l10n.t('Submit'),
        next: vscode.l10n.t('Next'),
        unanswered: vscode.l10n.t('Not answered'),
        waiting: vscode.l10n.t('Waiting for your input'),
        changesInTurn: vscode.l10n.t('Changes in turn {0}', '{0}'),
        files: vscode.l10n.t('files'),
        openDiff: vscode.l10n.t('Open diff'),
        revert: vscode.l10n.t('Revert'),
        reverted: vscode.l10n.t('Reverted'),
        unknownBefore: vscode.l10n.t('Changed by the shell (cannot revert)'),
        model: vscode.l10n.t('Model'),
        defaultModel: vscode.l10n.t('Default'),
        defaultModelWith: vscode.l10n.t('Default ({0})', '{0}'),
        effort: vscode.l10n.t('Effort'),
        effortLabels: {
          low: vscode.l10n.t('Low'),
          medium: vscode.l10n.t('Medium'),
          high: vscode.l10n.t('High'),
          xhigh: vscode.l10n.t('Extra high'),
          max: vscode.l10n.t('Max'),
        },
        previousModel: vscode.l10n.t('Previous turn: {0}', '{0}'),
        attachments: vscode.l10n.t('Attachments'),
        remove: vscode.l10n.t('Remove'),
        promptHint: vscode.l10n.t('Follow-up (Ctrl+Enter to send)'),
        promptHintPresets: vscode.l10n.t('Follow-up (Ctrl+Enter to send · / for presets)'),
        draftHint: vscode.l10n.t(
          'Write the next instruction while Claude works (send it after the turn ends)'
        ),
        dropHint: vscode.l10n.t('Drop files to attach (hold Shift when dragging from the editor)'),
        selection: vscode.l10n.t('Selection'),
        diagnostics: vscode.l10n.t('Diagnostics'),
        gitDiff: vscode.l10n.t('git diff'),
        addFile: vscode.l10n.t('File'),
        statusLabels: statusKindLabels(),
        worktree: vscode.l10n.t('worktree'),
        merge: vscode.l10n.t('Merge into {0}', '{0}'),
        merging: vscode.l10n.t('Merging…'),
        toolCalls: vscode.l10n.t('{0} tool calls', '{0}'),
        thinking: vscode.l10n.t('Thinking…'),
        thought: vscode.l10n.t('Thought'),
        compact: vscode.l10n.t('Compact the context'),
        compacted: vscode.l10n.t('Context compacted ({0} → {1})', '{0}', '{1}'),
        commandsHint: vscode.l10n.t('Claude Code commands and skills'),
        moreCandidates: vscode.l10n.t('{0} more: keep typing to filter', '{0}'),
        more: vscode.l10n.t('More actions'),
        rename: vscode.l10n.t('Rename'),
        contextPanel: vscode.l10n.t('What Claude will receive'),
        contextEmpty: vscode.l10n.t('Type a prompt to preview what will be sent.'),
        permissionMode: vscode.l10n.t('Permission mode'),
        alwaysAllowedList: vscode.l10n.t('Always allowed in this task'),
        directory: vscode.l10n.t('Directory'),
        noAttachments: vscode.l10n.t('No attachments'),
        attachmentCount: vscode.l10n.t('{0} attached', '{0}'),
        turn: vscode.l10n.t('Turn {0}', '{0}'),
        rewind: vscode.l10n.t('Rewind'),
        fork: vscode.l10n.t('Fork'),
        rewindHere: vscode.l10n.t('Rewind to here'),
        forkHere: vscode.l10n.t('Fork from here'),
        approveAndDone: vscode.l10n.t('Approve and finish'),
        approved: vscode.l10n.t('Approved'),
        unapprove: vscode.l10n.t('Undo approval'),
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
    const codicons = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'codicon.css')
    );
    const nonce = randomNonce();
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      `<meta http-equiv="Content-Security-Policy" content="${taskPanelCsp(webview.cspSource, nonce)}">`,
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

/** ターンごとの開始と終了の時刻（画面の日付の区切りと時刻に使う） */
function turnTimesOf(task: Task): { startedAt: string; endedAt?: string }[] {
  return task.turns.map((turn) => ({ startedAt: turn.startedAt, endedAt: turn.endedAt }));
}
