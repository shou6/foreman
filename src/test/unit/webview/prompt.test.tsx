import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
import { PANEL_STRINGS } from '../../support/panelStrings';

function state(prompt: string): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    mergeable: false,
    items: [{ kind: 'prompt', turn: 0, text: prompt }],
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: PANEL_STRINGS,
  };
}

function bubble(html: string): string {
  const start = html.indexOf('class="item prompt"');
  return html.slice(start, html.indexOf('</main>', start));
}

suite('webview: 指示の吹き出しの引用とコードブロック', () => {
  test('引用は blockquote、フェンスは pre > code（言語名は data-lang）、`…` は code になる', () => {
    const html = bubble(
      render(
        <App state={state('> quoted\nrun `npm test`\n```ts\nconst a = 1;\n```')} post={() => {}} />
      )
    );
    assert.ok(/<blockquote>quoted<\/blockquote>/.test(html));
    assert.ok(/<code>npm test<\/code>/.test(html));
    assert.ok(/<pre><code data-lang="ts">const a = 1;<\/code><\/pre>/.test(html));
  });

  test('HTML、リンク、画像、見出しは文字のまま。要素にならない', () => {
    const html = bubble(
      render(
        <App
          state={state('<script>alert(1)</script> <img src=x> [a](https://x) # h\n> <b>q</b>')}
          post={() => {}}
        />
      )
    );
    // 描画側は < だけをエスケープする（> は文字のままでも HTML として安全）
    assert.ok(html.includes('&lt;script>alert(1)&lt;/script>'));
    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('&lt;img src=x>'));
    assert.ok(!html.includes('<a ') && !html.includes('<img') && !html.includes('<h1'));
    assert.ok(/<blockquote>&lt;b>q&lt;\/b><\/blockquote>/.test(html));
  });

  test('記法が無ければ今までどおり文字だけ', () => {
    const html = bubble(render(<App state={state('plain text')} post={() => {}} />));
    assert.ok(html.includes('plain text'));
    assert.ok(!html.includes('<blockquote') && !html.includes('<pre') && !html.includes('<code'));
  });
});
