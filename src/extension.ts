import * as vscode from 'vscode';
import { helloMessage } from './hello';

/** エントリポイント。登録だけを行い、ロジックは各モジュールに置く */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('foreman.helloWorld', () => {
      const folderName = vscode.workspace.workspaceFolders?.[0]?.name;
      void vscode.window.showInformationMessage(helloMessage(vscode.l10n.t, folderName));
    })
  );
}

export function deactivate(): void {}
