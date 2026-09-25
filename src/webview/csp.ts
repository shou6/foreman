/**
 * タスク画面の CSP。スタイルは拡張機能の CSS に加え、nonce 付きの style 要素だけを許す。
 * スクロールバー（OverlayScrollbars）が、環境の判定に一時的な style 要素を使うため
 */
export function taskPanelCsp(cspSource: string, nonce: string): string {
  return `default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; font-src ${cspSource}; script-src 'nonce-${nonce}';`;
}
