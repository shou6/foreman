import * as assert from 'assert';
import {
  attachmentKey,
  normalizeAttachments,
  promptWithAttachments,
  type Attachment,
} from '../../../domain/attachments';

const file = (path: string): Attachment => ({ kind: 'file', path });

suite('promptWithAttachments', () => {
  test('添付が無ければ指示のまま', () => {
    assert.strictEqual(promptWithAttachments('fix it', []), 'fix it');
  });

  test('添付のパスを指示の後ろに列挙する', () => {
    assert.strictEqual(
      promptWithAttachments('fix it', [file('D:\\work\\a.ts'), file('D:\\work\\b.md')]),
      'fix it\n\nAttached files:\n- D:\\work\\a.ts\n- D:\\work\\b.md'
    );
  });

  test('重複した添付は 1 つにまとめる', () => {
    assert.strictEqual(
      promptWithAttachments('p', [file('a'), file('a'), file('b')]),
      'p\n\nAttached files:\n- a\n- b'
    );
  });

  test('選択範囲は、パスと行の範囲と本文をコードブロックで添える', () => {
    const text = promptWithAttachments('explain', [
      { kind: 'selection', path: 'src/a.ts', startLine: 22, endLine: 40, text: 'const x = 1;' },
    ]);
    assert.ok(text.includes('Selected code (src/a.ts:22-40):'));
    assert.ok(text.includes('```\nconst x = 1;\n```'));
  });

  test('診断と git diff は、見出しの下にそのまま添える', () => {
    const text = promptWithAttachments('fix', [
      { kind: 'diagnostics', count: 2, text: 'src/a.ts:3:1 error TS2322: ...' },
      { kind: 'gitDiff', files: 1, text: 'diff --git a/x b/x\n+1' },
    ]);
    assert.ok(text.includes('Diagnostics (2):\nsrc/a.ts:3:1 error TS2322: ...'));
    assert.ok(
      text.includes('Uncommitted git diff (1 files):\n```diff\ndiff --git a/x b/x\n+1\n```')
    );
  });
});

suite('attachmentKey / normalizeAttachments', () => {
  test('同じものを 1 つに数えるための鍵', () => {
    assert.strictEqual(attachmentKey(file('a')), 'file:a');
    assert.strictEqual(
      attachmentKey({ kind: 'selection', path: 'p', startLine: 1, endLine: 2, text: '' }),
      'selection:p:1-2'
    );
    assert.strictEqual(attachmentKey({ kind: 'diagnostics', count: 1, text: '' }), 'diagnostics');
    assert.strictEqual(attachmentKey({ kind: 'gitDiff', files: 1, text: '' }), 'gitDiff');
  });

  test('保存済みの古い形（パスの文字列）はファイルの添付として読む', () => {
    assert.deepStrictEqual(normalizeAttachments(['a', { kind: 'file', path: 'b' }, 3]), [
      file('a'),
      file('b'),
    ]);
  });
});
