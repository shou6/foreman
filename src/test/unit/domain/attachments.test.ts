import * as assert from 'assert';
import { promptWithAttachments } from '../../../domain/attachments';

suite('promptWithAttachments', () => {
  test('添付が無ければ指示のまま', () => {
    assert.strictEqual(promptWithAttachments('fix it', []), 'fix it');
  });

  test('添付のパスを指示の後ろに列挙する', () => {
    assert.strictEqual(
      promptWithAttachments('fix it', ['D:\\work\\a.ts', 'D:\\work\\b.md']),
      'fix it\n\nAttached files:\n- D:\\work\\a.ts\n- D:\\work\\b.md'
    );
  });

  test('重複した添付は 1 つにまとめる', () => {
    assert.strictEqual(
      promptWithAttachments('p', ['a', 'a', 'b']),
      'p\n\nAttached files:\n- a\n- b'
    );
  });
});
