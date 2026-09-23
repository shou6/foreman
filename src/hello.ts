/** vscode.l10n.t と同じ形の翻訳関数。テストでは翻訳しない関数に差し替える */
export type Translate = (message: string, ...args: string[]) => string;

/** Hello World コマンドで表示するメッセージ。vscode に依存しないので単体テストできる */
export function helloMessage(t: Translate, folderName: string | undefined): string {
  return folderName === undefined ? t('Hello World!') : t('Hello World from {0}!', folderName);
}
