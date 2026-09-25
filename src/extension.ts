import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { AgentSdkModelCatalog } from './adapters/agentSdkModelCatalog';
import { AgentSdkCommandCatalog } from './adapters/agentSdkCommandCatalog';
import { AgentSdkRunner } from './adapters/agentSdkRunner';
import { AgentSdkUsage } from './adapters/agentSdkUsage';
import { ScriptedRunner } from './adapters/scriptedRunner';
import type { AgentRunner } from './ports/agentRunner';
import { resolveClaudePath } from './adapters/claudePath';
import { FsSnapshotStore } from './adapters/fsSnapshotStore';
import { FsTaskStore } from './adapters/fsTaskStore';
import { FsTranscriptStore } from './adapters/fsTranscriptStore';
import { GitCli } from './adapters/gitCli';
import { VsCodeFileSystem } from './vscode/vsCodeFileSystem';
import { suggestTitleWithSdk } from './adapters/agentSdkTitler';
import { ApprovalService } from './app/approvalService';
import { AutoTitle } from './app/autoTitle';
import { DiffService } from './app/diffService';
import { CommandService } from './app/commandService';
import { ModelService } from './app/modelService';
import { RateLimitService } from './app/rateLimitService';
import { TaskService } from './app/taskService';
import { Transcripts } from './app/transcripts';
import { WorktreeService } from './app/worktreeService';
import { registerCommands, renameTask } from './vscode/commands';
import { Notifications } from './vscode/notifications';
import { readSettings } from './vscode/settings';
import { StatusBar } from './vscode/statusBar';
import { TaskPanels } from './vscode/taskPanel';
import { SNAPSHOT_SCHEME } from './vscode/snapshotUri';
import { SidebarView, SIDEBAR_VIEW_ID } from './vscode/sidebarView';
import { AttachmentSources } from './vscode/attachmentSources';
import { savePastedImage } from './adapters/pastedImages';
import { exportTask } from './vscode/exportTask';
import { moreActions } from './vscode/moreActions';
import { WorktreeActions } from './vscode/worktreeActions';
import { CheckpointActions } from './vscode/checkpointActions';
import { ReviewActions } from './vscode/reviewActions';
import { BoardPanel } from './vscode/boardPanel';
import { DetailsView, DETAILS_VIEW_ID } from './vscode/detailsView';
import { PlanDocuments, PLAN_SCHEME } from './vscode/planDocuments';
import { AgentSdkSessionCatalog } from './adapters/agentSdkSessionCatalog';
import { tasksToPrune } from './domain/retention';
import { OrphanCleaner } from './app/orphanCleaner';
import { FsRunRecordStore, WindowsProcessTable } from './adapters/windowsProcesses';

/** エントリポイント。組み立てと登録だけを行い、ロジックは各モジュールに置く */
/** 統合テストが拡張機能の中身を操作するための入口。FOREMAN_SCRIPTED_RUNNER=1 の時だけ返す */
export interface TestApi {
  service: TaskService;
  runner: ScriptedRunner;
  approvals: ApprovalService;
  diffs: DiffService;
  panels: TaskPanels;
  plans: PlanDocuments;
  /** claude CLI の場所を探す（見つからなければ設定を案内するエラー） */
  locateClaude: () => string;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<{ testApi?: TestApi } | undefined> {
  const output = vscode.window.createOutputChannel('Foreman');
  const sdk = await import('@anthropic-ai/claude-agent-sdk');

  // ワークスペースごとの保存先（実装計画書 4.5）。フォルダを開いていない時は拡張機能全体の保存先
  const storage = (context.storageUri ?? context.globalStorageUri).fsPath;
  const snapshots = new FsSnapshotStore(path.join(storage, 'snapshots'));
  const transcriptStore = new FsTranscriptStore(path.join(storage, 'transcripts'));

  // 統合テストでは Claude を起動せず、台本の Runner を差し込む
  const scripted = process.env.FOREMAN_SCRIPTED_RUNNER === '1' ? new ScriptedRunner() : undefined;
  // Windows では、異常終了で残ったプロセスを次の起動で止めるため、起動した claude を記録する（NFR-5）。
  // macOS と Linux は親が落ちると子の親が付け替わり、同じ方法では確かめられないので入れない
  const orphans =
    process.platform === 'win32' && scripted === undefined
      ? new OrphanCleaner({
          table: new WindowsProcessTable(),
          records: new FsRunRecordStore(path.join(context.globalStorageUri.fsPath, 'processes')),
          host: { pid: process.pid, startedAt: Date.now() - process.uptime() * 1000 },
          log: (line) => output.appendLine(line),
        })
      : undefined;
  if (orphans !== undefined) {
    void orphans
      .cleanup()
      .then((stopped) => {
        if (stopped.length > 0) {
          output.appendLine(
            `stopped ${stopped.length} process(es) left by a previous crash: ${stopped.join(', ')}`
          );
        }
      })
      .catch((error: unknown) => output.appendLine(`orphan cleanup failed: ${String(error)}`));
  }
  const runner: AgentRunner =
    scripted ??
    new AgentSdkRunner({
      query: sdk.query,
      claudePath: () => locateClaude(),
      log: (line) => output.append(line),
      processes: orphans,
    });
  // モデルの選択肢は起動後に 1 回だけ Claude Code から取得する。統合テストでは固定の一覧のまま
  const models = new ModelService(
    scripted !== undefined
      ? { list: async () => [] }
      : new AgentSdkModelCatalog({
          query: sdk.query,
          claudePath: () => locateClaude(),
          cwd: () => os.tmpdir(),
        }),
    (error) =>
      output.appendLine(
        `model list failed: ${error instanceof Error ? error.message : String(error)}`
      )
  );
  void models.load();
  // Claude Code のコマンドとスキル。作業フォルダで聞く（プロジェクトのコマンドも出るように）。統合テストでは聞かない
  const commands = new CommandService(
    scripted !== undefined
      ? { list: async () => [] }
      : new AgentSdkCommandCatalog({ query: sdk.query, claudePath: () => locateClaude() }),
    (error) =>
      output.appendLine(
        `command list failed: ${error instanceof Error ? error.message : String(error)}`
      )
  );
  void commands.load(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.tmpdir());
  // 契約の利用枠。起動時、ターンの終わり（1 分に 1 回まで）、10 分ごとに取り直す。統合テストでは聞かない
  const rateLimits = new RateLimitService(
    scripted !== undefined
      ? { usage: async () => undefined }
      : new AgentSdkUsage({
          query: sdk.query,
          claudePath: () => locateClaude(),
          cwd: () => os.tmpdir(),
        }),
    {
      now: () => new Date().toISOString(),
      onError: (error) =>
        output.appendLine(
          `plan usage failed: ${error instanceof Error ? error.message : String(error)}`
        ),
    }
  );
  void rateLimits.refresh();
  const usageTimer = setInterval(() => void rateLimits.refresh(), 10 * 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(usageTimer) });
  const approvals = new ApprovalService(() => randomUUID());
  const service = new TaskService({
    runner,
    store: new FsTaskStore(path.join(storage, 'tasks')),
    newId: () => randomUUID(),
    now: () => new Date().toISOString(),
    approve: (taskId, request) => approvals.request(taskId, request),
  });
  // 待っている間に止まった・失敗した要求は片付ける
  service.onDidChange((task) => {
    if (task.status !== 'waiting' && task.status !== 'running') {
      approvals.cancel(task.id);
    }
  });
  // Claude との通信の記録（いつ・どのタスクが・何を使ったか）を出力パネルへ
  const stamp = (): string => new Date().toISOString();
  service.onDidReceiveEvent(({ taskId, turn, event }) => {
    if (event.type === 'init') {
      output.appendLine(
        `${stamp()} [${taskId}] session ${event.sessionId} model=${event.model} turn=${turn}`
      );
    } else if (event.type === 'turn-end') {
      void rateLimits.refreshAfterTurn();
      const usage =
        event.ok && event.usage !== undefined
          ? ` in=${event.usage.inputTokens} cacheRead=${event.usage.cacheReadInputTokens} cacheWrite=${event.usage.cacheCreationInputTokens} out=${event.usage.outputTokens}`
          : '';
      output.appendLine(
        `${stamp()} [${taskId}] turn ${turn} ${event.ok ? 'ok' : `failed: ${event.reason}`}${usage}`
      );
    }
  });
  service.onDidChange((task) => {
    output.appendLine(`${stamp()} [${task.id}] ${task.status} "${task.title}"`);
  });
  // 前回の履歴を読んでから、前回の終了で途中だったタスクを中断に直す（中断の記録が履歴にも残る）
  const transcripts = new Transcripts(service, transcriptStore, await transcriptStore.loadAll());
  await service.recover();
  const git = new GitCli();
  const diffs = new DiffService({
    service,
    // 監視は VS Code のファイル監視（Linux の Node の再帰的な監視は、大きなリポジトリで遅い）
    fs: new VsCodeFileSystem(),
    snapshots,
    sep: path.sep,
    isIgnored: (dir, paths) => git.ignored(dir, paths),
    baseline: (dir, file) => git.showHead(dir, file),
  });
  // 完了から保存期間を過ぎたタスクのスナップショットを消す（NFR-4）
  {
    const now = new Date().toISOString();
    const ids = tasksToPrune(await service.list(), now, readSettings().snapshotRetentionDays);
    if (ids.length > 0) {
      void diffs
        .prune(ids, now)
        .then(() => output.appendLine(`${now} pruned snapshots of ${ids.length} task(s)`))
        .catch((error: unknown) =>
          output.appendLine(
            `snapshot pruning failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
    }
  }
  const worktrees = new WorktreeService({
    git,
    sep: path.sep,
    branchPrefix: () => readSettings().worktreeBranchPrefix,
    listDirs: async (dir) => {
      try {
        return (await fs.promises.readdir(dir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        return [];
      }
    },
    removeDir: (dir) => fs.promises.rm(dir, { recursive: true, force: true }),
  });
  const worktreeActions = new WorktreeActions(service, worktrees);
  // panels と autoTitle は後で作るので、参照は遅延で解く
  let panelsRef: TaskPanels | undefined;
  let autoTitleRef: AutoTitle | undefined;
  const checkpoints = new CheckpointActions({
    service,
    diffs,
    worktrees,
    get autoTitle() {
      if (autoTitleRef === undefined) {
        throw new Error('AutoTitle is not ready');
      }
      return autoTitleRef;
    },
    settings: readSettings,
    newId: () => randomUUID(),
    openPanel: async (taskId) => panelsRef?.open(taskId),
  });
  const review = new ReviewActions({
    service,
    worktrees,
    settings: readSettings,
    openPanel: async (taskId) => panelsRef?.open(taskId),
    afterStart: (task) => void autoTitleRef?.onCreated(task),
  });
  const sources = new AttachmentSources(git);
  context.subscriptions.push(sources);
  // 計画（ExitPlanMode）をエディターで読むための読み取り専用の文書
  const plans = new PlanDocuments();
  const panels = new TaskPanels({
    extensionUri: context.extensionUri,
    service,
    transcripts,
    approvals,
    diffs,
    models,
    commands,
    finish: {
      merge: (taskId) => worktreeActions.merge(taskId),
      discard: (taskId) => worktreeActions.discard(taskId),
    },
    exportTask: (taskId) => exportTask(taskId, service, transcripts),
    approve: (taskId) => review.approve(taskId),
    unapprove: (taskId) => review.unapprove(taskId),
    sources,
    savePastedImage: (mime, data) => savePastedImage(path.join(storage, 'attachments'), mime, data),
    openPlan: async (taskId, plan) => {
      const task = await service.load(taskId);
      await plans.open(taskId, task?.title ?? '', plan);
    },
    renameTask: (taskId) => renameTask(service, taskId),
    moreActions: (taskId) => moreActions(service, taskId),
    checkpoint: {
      rewind: (taskId, turn) => checkpoints.rewind(taskId, turn),
      fork: (taskId, turn) => checkpoints.fork(taskId, turn),
    },
  });
  panelsRef = panels;
  const board = new BoardPanel({
    extensionUri: context.extensionUri,
    service,
    approvals,
    openTask: (taskId) => panels.open(taskId),
    newDraft: async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (folder === undefined) {
        void vscode.window.showErrorMessage(vscode.l10n.t('Open a folder before creating a task.'));
        return;
      }
      const task = await review.newDraft(folder.uri.fsPath);
      if (task !== undefined) {
        void autoTitleRef?.onCreated(task);
      }
    },
    start: (taskId) => review.start(taskId),
    approve: (taskId) => review.approve(taskId),
    onError: (error) => {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    },
    now: () => new Date().toISOString(),
  });
  const details = new DetailsView({
    models,
    // 下の区画（セッション）の高さはウィンドウをまたいで覚えておく
    dockHeight: {
      get: () => context.globalState.get<number>('foreman.details.dockHeight'),
      set: (height) => context.globalState.update('foreman.details.dockHeight', height),
    },
    extensionUri: context.extensionUri,
    service,
    approvals,
    diffs,
    activeTaskId: () => panels.activeTaskId,
    onDidChangeActive: (listener) => panels.onDidChangeActive(listener),
    openTask: (taskId) => panels.open(taskId),
    openDiff: (taskId, turn, path) => panels.openDiff(taskId, turn, path),
    rewind: (taskId, turn) => checkpoints.rewind(taskId, turn),
    fork: (taskId, turn) => checkpoints.fork(taskId, turn),
    merge: (taskId) => worktreeActions.merge(taskId),
    discard: (taskId) => worktreeActions.discard(taskId),
    onError: (error) => {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    },
  });
  const sidebar = new SidebarView({
    extensionUri: context.extensionUri,
    service,
    approvals,
    rateLimits,
    activeTaskId: () => panels.activeTaskId,
    onDidChangeActive: (listener) => panels.onDidChangeActive(listener),
    openTask: (taskId) => panels.open(taskId),
    newTask: async () => {
      await vscode.commands.executeCommand('foreman.newTask');
    },
    now: () => new Date().toISOString(),
    onError: (error) => {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    },
  });

  const statusBar = new StatusBar(
    service,
    {
      id: () => panels.activeTaskId,
      onDidChange: (listener) => panels.onDidChangeActive(listener),
    },
    rateLimits
  );
  context.subscriptions.push(
    output,
    panels,
    board,
    statusBar,
    // 利用枠の表示の設定が変わったら描き直す
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('foreman.planUsage')) {
        void statusBar.refresh();
        void sidebar.refresh();
      }
    }),
    new Notifications(
      service,
      (taskId) => void panels.open(taskId),
      () => readSettings().notifications
    ),
    sidebar,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebar),
    details,
    vscode.window.registerWebviewViewProvider(DETAILS_VIEW_ID, details),
    plans,
    vscode.workspace.registerTextDocumentContentProvider(PLAN_SCHEME, plans),
    // 差分エディタの左側（変更前）をスナップショットから出す
    vscode.workspace.registerTextDocumentContentProvider(SNAPSHOT_SCHEME, {
      provideTextDocumentContent: async (uri) =>
        uri.query === '' ? '' : ((await snapshots.load(uri.query)) ?? ''),
    }),
    { dispose: () => service.dispose() },
    { dispose: () => void transcriptStore.flush() }
  );
  const autoTitle = new AutoTitle(service, {
    // 台本の Runner の時（統合テスト）は Claude を呼ばない
    enabled: () => scripted === undefined && readSettings().autoTitle,
    suggest: (prompt) =>
      suggestTitleWithSdk(sdk.query, {
        prompt,
        model: readSettings().titleModel,
        claudePath: locateClaude(),
        cwd: os.tmpdir(),
      }),
  });
  autoTitleRef = autoTitle;
  registerCommands(context, {
    service,
    panels,
    checkpoints,
    review: {
      approve: (taskId) => review.approve(taskId),
      unapprove: (taskId) => review.unapprove(taskId),
      start: (taskId) => review.start(taskId),
      editDraft: (taskId) => review.editDraft(taskId),
      newDraft: (folder) => review.newDraft(folder),
    },
    openBoard: () => board.open(),
    refreshUsage: () => rateLimits.refresh(),
    sessions: new AgentSdkSessionCatalog({
      listSessions: sdk.listSessions,
      getSessionMessages: sdk.getSessionMessages,
    }),
    settings: readSettings,
    worktrees,
    worktreeActions,
    newId: () => randomUUID(),
    exportTask: (taskId) => exportTask(taskId, service, transcripts),
    afterCreate: (task) => void autoTitle.onCreated(task),
    selectionOf: (editor) => sources.selection(editor),
  });

  // タスクの無い worktree（前回の異常終了で残ったものなど）を片付ける
  void cleanupWorktrees(service, worktrees, output);
  return scripted === undefined
    ? undefined
    : { testApi: { service, runner: scripted, approvals, diffs, panels, plans, locateClaude } };
}

export function deactivate(): void {}

async function cleanupWorktrees(
  service: TaskService,
  worktrees: WorktreeService,
  output: vscode.OutputChannel
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    return;
  }
  try {
    const repo = await worktrees.repoRoot(folder.uri.fsPath);
    if (repo === undefined) {
      return;
    }
    const inUse = (await service.list())
      .map((task) => task.worktree?.path)
      .filter((p): p is string => p !== undefined);
    await worktrees.cleanupOrphans(repo, inUse);
  } catch (error) {
    output.appendLine(
      `worktree cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** ユーザーの claude CLI の場所。見つからなければ、設定を案内する文言で失敗する */
function locateClaude(): string {
  const result = resolveClaudePath({
    platform: process.platform,
    home: os.homedir(),
    pathEntries: (process.env.PATH ?? '').split(path.delimiter),
    configured: readSettings().claudePath,
    exists: (file) => fs.existsSync(file),
  });
  if ('error' in result) {
    throw new Error(
      result.error === 'setting-not-found'
        ? vscode.l10n.t('foreman.claudePath points to a missing file: {0}', result.path)
        : vscode.l10n.t(
            'Claude Code CLI was not found. Install it and log in, or set foreman.claudePath.'
          )
    );
  }
  return result.path;
}
