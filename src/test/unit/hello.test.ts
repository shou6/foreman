import * as assert from 'assert';
import { helloMessage } from '../../hello';

/** 翻訳はせず、{0} などの差し込みだけを行う。vscode.l10n.t の代わりに渡す */
function t(message: string, ...args: string[]): string {
  return message.replace(/\{(\d+)\}/g, (_, index: string) => args[Number(index)] ?? '');
}

suite('helloMessage', () => {
  test('フォルダを開いていない時は、名前を入れずに挨拶する', () => {
    assert.strictEqual(helloMessage(t, undefined), 'Hello World!');
  });

  test('フォルダを開いている時は、その名前を差し込む', () => {
    assert.strictEqual(helloMessage(t, 'sample'), 'Hello World from sample!');
  });
});
