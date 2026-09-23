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
import { SNAPSHOT_SCHEME, TaskPanels } from './vscode/taskPanel';
import { TaskTreeProvider } from './vscode/taskTreeView';
import { exportTask } from './vscode/exportTask';
import { WorktreeActions } from './vscode/worktreeActions';
import { CheckpointActions } from './vscode/checkpointActions';

/** エントリポイント。組み立てと登録だけを行い、ロジックは各モジュールに置く */
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
    checkpoint: {
      rewind: (taskId, turn) => checkpoints.rewind(taskId, turn),
      fork: (taskId, turn) => checkpoints.fork(taskId, turn),
    },
  });
  panelsRef = panels;
  const tree = new TaskTreeProvider(service);

  context.subscriptions.push(
    output,
    panels,
    new StatusBar(service),
    new Notifications(
      service,
      (taskId) => void panels.open(taskId),
      () => readSettings().notifications
    ),
    vscode.window.registerTreeDataProvider('foreman.tasks', tree),
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
    settings: readSettings,
    worktrees,
    worktreeActions,
    newId: () => randomUUID(),
    exportTask: (taskId) => exportTask(taskId, service, transcripts),
    afterCreate: (task) => void autoTitle.onCreated(task),
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
