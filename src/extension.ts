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
import { NodeFileSystem } from './adapters/nodeFileSystem';
import { ApprovalService } from './app/approvalService';
import { DiffService } from './app/diffService';
import { TaskService } from './app/taskService';
import { Transcripts } from './app/transcripts';
import { registerCommands } from './vscode/commands';
import { Notifications } from './vscode/notifications';
import { readSettings } from './vscode/settings';
import { StatusBar } from './vscode/statusBar';
import { SNAPSHOT_SCHEME, TaskPanels } from './vscode/taskPanel';
import { TaskTreeProvider } from './vscode/taskTreeView';

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
  // 前回の履歴を読んでから、前回の終了で途中だったタスクを中断に直す（中断の記録が履歴にも残る）
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
  const transcripts = new Transcripts(service, transcriptStore, await transcriptStore.loadAll());
  await service.recover();
  const diffs = new DiffService({ service, fs: new NodeFileSystem(), snapshots, sep: path.sep });
  const panels = new TaskPanels({
    extensionUri: context.extensionUri,
    service,
    transcripts,
    approvals,
    diffs,
  });
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
  registerCommands(context, { service, panels, settings: readSettings });
}

export function deactivate(): void {}

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
