import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    mergeable: false,
    items: [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'tool', turn: 0, id: '1', name: 'Read', input: { file_path: 'a.ts' }, status: 'ok' },
      { kind: 'tool', turn: 0, id: '2', name: 'Bash', input: { command: 'ls' }, status: 'error' },
      { kind: 'tool', turn: 0, id: '3', name: 'Grep', input: { pattern: 'x' }, status: 'ok' },
    ],
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: ツールの呼び出しのたたみ', () => {
  test('既定ではたたみ、件数と成否とツール名の要約を出す', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(/<details[^>]*class="tool-group[^"]*"(?![^>]*\bopen\b)/.test(html), 'たたまれている');
    assert.ok(html.includes('3 tool calls'));
    assert.ok(html.includes('✓2'));
    assert.ok(html.includes('✗1'));
    assert.ok(html.includes('Read, Bash, Grep'));
  });

  test('設定で開いた状態にできる', () => {
    const html = render(<App state={state({ toolCallsExpanded: true })} post={() => {}} />);
    assert.ok(/<details[^>]*class="tool-group[^"]*"[^>]*\bopen\b/.test(html));
  });

  test('実行中のツールがあっても、たたみの設定なら開かない（開閉が繰り返されないように）', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          mergeable: false,
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'tool', turn: 0, id: '1', name: 'Read', input: {}, status: 'running' },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/<details[^>]*class="tool-group[^"]*"(?![^>]*open)/.test(html), 'たたまれたまま');
  });

  test('実行中のツールは、たたんだグループの外に対象付きの 1 行で見せ、要約の名前からは外す', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'tool', turn: 0, id: '1', name: 'Read', input: {}, status: 'ok' },
            {
              kind: 'tool',
              turn: 0,
              id: '2',
              name: 'Edit',
              input: { file_path: 'src/test/unit/diffCard.test.ts' },
              status: 'running',
            },
          ],
        })}
        post={() => {}}
      />
    );
    const summary = html.slice(html.indexOf('class="group-summary"'), html.indexOf('</summary>'));
    assert.ok(summary.includes('Read'));
    assert.ok(!summary.includes('Edit'));
    const running = html.slice(html.indexOf('</details>'));
    assert.ok(
      /class="tool-running"[\s\S]*?codicon-loading codicon-modifier-spin[\s\S]*?class="tool-name"[^>]*>Edit<[\s\S]*?src\/test\/unit\/diffCard.test.ts/.test(
        running
      )
    );
  });
});

suite('webview: 見出しの「…」メニュー', () => {
  test('エクスポートなどは見出しに並べず「…」にまとめ、more のメッセージを送る', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('>Export<'));
    assert.ok(
      /class="icon-button more"[^>]*title="More actions"[^>]*><i[^>]*codicon-ellipsis/.test(html)
    );
    const message: ToExtension = { type: 'more' };
    assert.strictEqual(message.type, 'more');
  });
});

suite('webview: タスク名の変更', () => {
  test('見出しの題名はボタンで、押すと rename のメッセージを送る', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(/<button[^>]*class="title"[^>]*title="Rename"/.test(html));
    const message: ToExtension = { type: 'rename' };
    assert.strictEqual(message.type, 'rename');
  });
});
