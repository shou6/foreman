import * as vscode from 'vscode';

/** 計画（ExitPlanMode）をエディターで読むための URI スキーム */
export const PLAN_SCHEME = 'foreman-plan';

/**
 * 計画を読み取り専用の Markdown 文書として出す。タスクごとに 1 つの文書を使い、
 * 開き直すと新しい計画に置き換える。承認はタスク画面のカードで行う
 */
export class PlanDocuments implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  /** タスクの計画の URI。タブの名前はタスク名から付ける */
  private uriOf(taskId: string, title: string): vscode.Uri {
    const name = vscode.l10n.t('{0} (plan)', title.replace(/[\\/]/g, ' ').trim() || taskId);
    return vscode.Uri.from({ scheme: PLAN_SCHEME, path: '/' + taskId + '/' + name + '.md' });
  }

  private set(taskId: string, title: string, plan: string): vscode.Uri {
    const uri = this.uriOf(taskId, title);
    this.contents.set(uri.toString(), plan);
    this.changed.fire(uri);
    return uri;
  }

  /** 計画を文書にして、Markdown のプレビューを別のタブで開く */
  async open(taskId: string, title: string, plan: string): Promise<vscode.Uri> {
    const uri = this.set(taskId, title, plan);
    const doc = await vscode.workspace.openTextDocument(uri);
    if (doc.languageId !== 'markdown') {
      await vscode.languages.setTextDocumentLanguage(doc, 'markdown');
    }
    await vscode.commands.executeCommand('markdown.showPreview', uri);
    return uri;
  }

  dispose(): void {
    this.changed.dispose();
  }
}
