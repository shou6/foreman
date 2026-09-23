import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { AgentSdkRunner } from './adapters/agentSdkRunner';
import { resolveClaudePath } from './adapters/claudePath';
import { FsSnapshotStore } from './adapters/fsSnapshotStore';
import { FsTaskStore } from './adapters/fsTaskStore';
import { FsTranscriptStore } from './adapters/fsTranscriptStore';
import { GitCli } from './adapters/gitCli';
import { NodeFileSystem } from './adapters/nodeFileSystem';
import { suggestTitleWithSdk } from './adapters/agentSdkTitler';
import { ApprovalService } from './app/approvalService';
import { AutoTitle } from './app/autoTitle';
import { DiffService } from './app/diffService';
import { TaskService } from './app/taskService';
import { Transcripts } from './app/transcripts';
import { WorktreeService } from './app/worktreeService';
import { registerCommands } from './vscode/commands';
import { Notifications } from './vscode/notifications';
import { readSettings } from './vscode/settings';
import { StatusBar } from './vscode/statusBar';
import { TaskPanels } from './vscode/taskPanel';
import { SNAPSHOT_SCHEME } from './vscode/snapshotUri';
import { SidebarView, SIDEBAR_VIEW_ID } from './vscode/sidebarView';
import { AttachmentSources } from './vscode/attachmentSources';
import { inboxDirOf, writeToInbox } from './adapters/localNotifierInbox';
import { exportTask } from './vscode/exportTask';
import { WorktreeActions } from './vscode/worktreeActions';
import { CheckpointActions } from './vscode/checkpointActions';
import { ReviewActions } from './vscode/reviewActions';
import { BoardPanel } from './vscode/boardPanel';
import { DetailsView, DETAILS_VIEW_ID } from './vscode/detailsView';

/** エントリポイント。組み立てと登録だけを行い、ロジックは各モジュールに置く */
const LOCAL_NOTIFIER_ID = 'shou6.vscode-local-notifier';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Foreman');
  const sdk = await import('@anthropic-ai/claude-agent-sdk');

  // ワークスペースごとの保存先（実装計画書 4.5）。フォルダを開いていない時は拡張機能全体の保存先
  const storage = (context.storageUri ?? context.globalStorageUri).fsPath;
  const snapshots = new FsSnapshotStore(path.join(storage, 'snapshots'));
  const transcriptStore = new FsTranscriptStore(path.join(storage, 'transcripts'));

  const runner = new AgentSdkRunner({
    query: sdk.query,
    claudePath: () => locateClaude(),
    log: (line) => output.append(line),
  });
  const approvals = new ApprovalService(() => randomUUID());
  const service = new TaskService({
    runner,
    store: new FsTaskStore(path.join(storage, 'tasks')),
    newId: () => randomUUID(),
    now: () => new Date().toISOString(),
    approve: (taskId, request) => approvals.request(taskId, request),
    settingSources: () => readSettings().settingSources,
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
    fs: new NodeFileSystem(),
    snapshots,
    sep: path.sep,
    isIgnored: (dir, paths) => git.ignored(dir, paths),
    baseline: (dir, file) => git.showHead(dir, file),
  });
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
  const panels = new TaskPanels({
    extensionUri: context.extensionUri,
    service,
    transcripts,
    approvals,
    diffs,
    finish: {
      merge: (taskId) => worktreeActions.merge(taskId),
      discard: (taskId) => worktreeActions.discard(taskId),
    },
    exportTask: (taskId) => exportTask(taskId, service, transcripts),
    approve: (taskId) => review.approve(taskId),
    sources,
    checkpoint: {
      rewind: (taskId, turn) => checkpoints.rewind(taskId, turn),
      fork: (taskId, turn) => checkpoints.fork(taskId, turn),
    },
  });
  panelsRef = panels;
  const board = new BoardPanel({
    extensionUri: context.extensionUri,
    service,
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
    editDraft: (taskId) => review.editDraft(taskId),
    fork: (taskId) => checkpoints.fork(taskId),
    delete: async (taskId) => {
      await vscode.commands.executeCommand('foreman.deleteTask', taskId);
    },
    onError: (error) => {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    },
    now: () => new Date().toISOString(),
  });
  const details = new DetailsView({
    extensionUri: context.extensionUri,
    service,
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

  context.subscriptions.push(
    output,
    panels,
    board,
    new StatusBar(service),
    new Notifications(
      service,
      (taskId) => void panels.open(taskId),
      () => readSettings().notifications,
      () => readSettings().notificationChannel,
      async (notification) => {
        if (vscode.extensions.getExtension(LOCAL_NOTIFIER_ID) === undefined) {
          throw new Error(
            vscode.l10n.t('Install the Local Notifier extension ({0}).', LOCAL_NOTIFIER_ID)
          );
        }
        const dir = inboxDirOf({
          configured: vscode.workspace
            .getConfiguration('localNotifier')
            .get<string>('inboxPath', ''),
          globalStorage: context.globalStorageUri.fsPath,
          sep: path.sep,
        });
        await writeToInbox(
          dir,
          {
            ...notification,
            project: vscode.workspace.workspaceFolders?.[0]?.name,
            source: 'Foreman',
          },
          { now: Date.now(), pid: process.pid }
        );
      }
    ),
    sidebar,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebar),
    details,
    vscode.window.registerWebviewViewProvider(DETAILS_VIEW_ID, details),
    // 差分エディタの左側（変更前）をスナップショットから出す
    vscode.workspace.registerTextDocumentContentProvider(SNAPSHOT_SCHEME, {
      provideTextDocumentContent: async (uri) =>
        uri.query === '' ? '' : ((await snapshots.load(uri.query)) ?? ''),
    }),
    { dispose: () => service.dispose() },
    { dispose: () => void transcriptStore.flush() }
  );
  const autoTitle = new AutoTitle(service, {
    enabled: () => readSettings().autoTitle,
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
      start: (taskId) => review.start(taskId),
      editDraft: (taskId) => review.editDraft(taskId),
      newDraft: (folder) => review.newDraft(folder),
    },
    openBoard: () => board.open(),
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
