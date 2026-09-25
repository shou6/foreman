import * as assert from 'assert';
import { taskPanelCsp } from '../../../webview/csp';

suite('webview: タスク画面の CSP', () => {
  test('スタイルは拡張機能の CSS と、nonce 付きの style 要素だけを許す（スクロールバーの環境の判定に使う）', () => {
    assert.strictEqual(
      taskPanelCsp('https://cdn.example', 'abc123'),
      "default-src 'none'; style-src https://cdn.example 'nonce-abc123'; font-src https://cdn.example; script-src 'nonce-abc123';"
    );
  });

  test("インラインのスタイルを丸ごと許す 'unsafe-inline' は使わない", () => {
    assert.ok(!taskPanelCsp('https://cdn.example', 'abc123').includes('unsafe-inline'));
  });
});
