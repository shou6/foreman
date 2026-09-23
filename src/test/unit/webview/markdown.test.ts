import * as assert from 'assert';
import { renderMarkdown } from '../../../webview/markdown';

suite('renderMarkdown', () => {
  test('見出し、箇条書き、コードを HTML にする', () => {
    const html = renderMarkdown('## 動作環境\n\n- VS Code `^1.138.0`\n- Node.js 24\n');
    assert.ok(html.includes('<h2>動作環境</h2>'));
    assert.ok(html.includes('<li>'));
    assert.ok(html.includes('<code>^1.138.0</code>'));
  });

  test('コードブロックは pre と code になる', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\n```\n');
    assert.ok(html.includes('<pre><code'));
    assert.ok(html.includes('const a = 1;'));
  });

  test('生の HTML はそのまま出さず、文字として見せる', () => {
    const html = renderMarkdown('before <script>alert(1)</script> after');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('リンクは新しいタブで開き、javascript: のリンクは無効にする', () => {
    const ok = renderMarkdown('[docs](https://example.com)');
    assert.ok(ok.includes('href="https://example.com"'));
    const bad = renderMarkdown('[x](javascript:alert(1))');
    assert.ok(!bad.includes('javascript:'));
  });

  test('改行だけの文章は段落として出す', () => {
    const html = renderMarkdown('one\ntwo');
    assert.ok(html.includes('<p>'));
  });
});
