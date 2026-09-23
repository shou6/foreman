import * as vscode from 'vscode';
import type { Attachment } from '../domain/attachments';
import type { Git } from '../ports/git';

/**
 * 「渡すもの」の材料を VS Code から集める（FR-VIEW-5、11、12）。
 * タスク画面に移るとエディタは「アクティブ」でなくなるので、最後の選択範囲を覚えておく
 */
export class AttachmentSources implements vscode.Disposable {
  private last: { document: vscode.TextDocument; selection: vscode.Selection } | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly git: Git) {
    const remember = (editor: vscode.TextEditor | undefined): void => {
      if (editor !== undefined && editor.document.uri.scheme === 'file') {
        this.last = { document: editor.document, selection: editor.selection };
      }
    };
    remember(vscode.window.activeTextEditor);
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(remember),
      vscode.window.onDidChangeTextEditorSelection((e) => remember(e.textEditor)),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (this.last?.document === document) {
          this.last = undefined;
        }
      })
    );
  }

  /** エディタの選択範囲。今のエディタ、無ければ最後に触ったエディタ。選択が無ければカーソル行 */
  selection(
    editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor
  ): Attachment | undefined {
    const target =
      editor !== undefined && editor.document.uri.scheme === 'file'
        ? { document: editor.document, selection: editor.selection }
        : this.last;
    if (target === undefined || target.document.isClosed) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Open a file and select the code to attach.')
      );
      return undefined;
    }
    const { document, selection } = target;
    const range = selection.isEmpty ? document.lineAt(selection.active.line).range : selection;
    return {
      kind: 'selection',
      path: vscode.workspace.asRelativePath(document.uri, false),
      startLine: range.start.line + 1,
      endLine: range.end.line + 1,
      text: document.getText(range),
    };
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  /** 問題パネルのエラーと警告（file スキームのみ） */
  diagnostics(): Attachment | undefined {
    const lines: string[] = [];
    for (const [uri, items] of vscode.languages.getDiagnostics()) {
      if (uri.scheme !== 'file') {
        continue;
      }
      const relative = vscode.workspace.asRelativePath(uri, false);
      for (const d of items) {
        if (
          d.severity !== vscode.DiagnosticSeverity.Error &&
          d.severity !== vscode.DiagnosticSeverity.Warning
        ) {
          continue;
        }
        const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
        const code = typeof d.code === 'object' ? d.code.value : d.code;
        const source = [d.source, code].filter((v) => v !== undefined && v !== '').join(' ');
        lines.push(
          `${relative}:${d.range.start.line + 1}:${d.range.start.character + 1} ${severity}${source === '' ? '' : ' ' + source}: ${d.message}`
        );
      }
    }
    if (lines.length === 0) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No errors or warnings to attach.'));
      return undefined;
    }
    return { kind: 'diagnostics', count: lines.length, text: lines.join('\n') };
  }

  /** 作業ディレクトリの未コミットの差分（追跡外は含まない） */
  async gitDiff(cwd: string): Promise<Attachment | undefined> {
    const repo = await this.git.repoRoot(cwd);
    if (repo === undefined) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('This task does not run in a Git repository.')
      );
      return undefined;
    }
    const text = (await this.git.diff(cwd)).trim();
    if (text === '') {
      void vscode.window.showInformationMessage(vscode.l10n.t('No uncommitted changes to attach.'));
      return undefined;
    }
    const files = (text.match(/^diff --git /gm) ?? []).length;
    return { kind: 'gitDiff', files, text };
  }

  /** ファイルの選択ダイアログ */
  async pickFiles(): Promise<Attachment[]> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: vscode.l10n.t('Attach'),
    });
    return (uris ?? [])
      .filter((u) => u.scheme === 'file')
      .map((u) => ({ kind: 'file', path: u.fsPath }));
  }
}
