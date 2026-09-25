import * as vscode from 'vscode';
import * as fsSync from 'fs';
import { NodeFileSystem } from '../adapters/nodeFileSystem';

/**
 * 作業ディレクトリの監視を VS Code のファイル監視で行う FileSystem。読み書きは Node のまま。
 *
 * Node の fs.watch の recursive は、Linux ではフォルダを 1 つずつ歩いて登録する。devcontainer の
 * バインドマウントのような遅いファイルシステムで大きなリポジトリ（.venv、.git など）を歩くと、
 * 登録の間ホストの I/O が詰まり、Claude Code の起動と出力が 2 分ほど遅れた（2026-09-26）。
 * VS Code の監視は files.watcherExclude（既定で node_modules と .git を除く）を守り、
 * リモートやコンテナでも動くように作られている
 */
export class VsCodeFileSystem extends NodeFileSystem {
  override watch(dir: string, onChange: (file: string) => void): () => void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(dir), '**')
    );
    const notify = (uri: vscode.Uri): void => {
      if (uri.scheme !== 'file') {
        return;
      }
      const full = uri.fsPath;
      // フォルダの変更は知らせない（中のファイルの変更は別に届く）。消えたパスは判別できないので知らせる
      fsSync.stat(full, (error, stat) => {
        if (error === null && stat.isDirectory()) {
          return;
        }
        onChange(full);
      });
    };
    const subscriptions = [
      watcher.onDidCreate(notify),
      watcher.onDidChange(notify),
      watcher.onDidDelete(notify),
    ];
    return () => {
      for (const s of subscriptions) {
        s.dispose();
      }
      watcher.dispose();
    };
  }
}
