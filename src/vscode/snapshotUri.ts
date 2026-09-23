import * as vscode from 'vscode';

export const SNAPSHOT_SCHEME = 'foreman-snapshot';

/** スナップショットの URI。hash が無ければ空の内容（新規作成の前、削除の後） */
export function snapshotUri(file: string, hash: string | undefined): vscode.Uri {
  return vscode.Uri.from({
    scheme: SNAPSHOT_SCHEME,
    path: '/' + file.replace(/\\/g, '/'),
    query: hash ?? '',
  });
}
