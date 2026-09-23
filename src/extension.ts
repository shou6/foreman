import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { AgentSdkRunner } from './adapters/agentSdkRunner';
import { resolveClaudePath } from './adapters/claudePath';
import { InMemoryTaskStore } from './adapters/inMemoryTaskStore';
import { TaskService } from './app/taskService';
import { Transcripts } from './app/transcripts';
import { askPermission } from './vscode/approvals';
import { registerCommands } from './vscode/commands';
import { readSettings } from './vscode/settings';
import { StatusBar } from './vscode/statusBar';
import { TaskPanels } from './vscode/taskPanel';
import { TaskTreeProvider } from './vscode/taskTreeView';

/** エントリポイント。組み立てと登録だけを行い、ロジックは各モジュールに置く */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Foreman');
  const sdk = await import('@anthropic-ai/claude-agent-sdk');

  const runner = new AgentSdkRunner({
    query: sdk.query,
    claudePath: () => locateClaude(),
    log: (line) => output.append(line),
  });
  const store = new InMemoryTaskStore();
  const service = new TaskService({
    runner,
    store,
    newId: () => randomUUID(),
    now: () => new Date().toISOString(),
    approve: async (taskId, request) => {
      const task = await store.load(taskId);
      return askPermission(task?.title ?? taskId, request);
    },
  });
  const transcripts = new Transcripts(service);
  const panels = new TaskPanels(context.extensionUri, service, transcripts);
  const tree = new TaskTreeProvider(service);

  context.subscriptions.push(
    output,
    panels,
    new StatusBar(service),
    vscode.window.registerTreeDataProvider('foreman.tasks', tree),
    { dispose: () => service.dispose() }
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
