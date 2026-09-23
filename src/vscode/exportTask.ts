import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import type { Transcripts } from '../app/transcripts';
import { exportTaskMarkdown } from '../domain/exportTask';
import { worktreeName } from '../domain/worktree';

/** タスクを Markdown に書き出し、保存先を選んでもらってから開く（FR-TASK-13） */
export async function exportTask(
  taskId: string,
  service: TaskService,
  transcripts: Transcripts
): Promise<void> {
  const task = await service.load(taskId);
  if (task === undefined) {
    return;
  }
  const markdown = exportTaskMarkdown(task, transcripts.get(taskId));
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const name = `foreman-${worktreeName(task.title, task.id)}.md`;
  const target = await vscode.window.showSaveDialog({
    title: vscode.l10n.t('Export Task'),
    defaultUri: folder !== undefined ? vscode.Uri.joinPath(folder, name) : undefined,
    filters: { Markdown: ['md'] },
  });
  if (target === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf8'));
  await vscode.window.showTextDocument(target);
}
