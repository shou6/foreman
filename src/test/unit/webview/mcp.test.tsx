import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
import { reduce } from '../../../webview/state';
import { PANEL_STRINGS } from '../../support/panelStrings';

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    mergeable: false,
    items: [],
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: PANEL_STRINGS,
    ...overrides,
  };
}

suite('webview: MCP サーバーの状態（Context パネル）', () => {
  test('mcp メッセージで状態に入る', () => {
    const s = reduce(state({}), {
      type: 'mcp',
      mcp: { running: true, servers: [{ name: 'github', status: 'connected' }] },
    });
    assert.deepStrictEqual(s?.mcp, {
      running: true,
      servers: [{ name: 'github', status: 'connected' }],
    });
  });

  test('サーバーごとに名前と状態を出し、失敗の時は理由を添える', () => {
    const html = render(
      <App
        state={state({
          mcp: {
            running: true,
            servers: [
              { name: 'github', status: 'connected', scope: 'user' },
              { name: 'db', status: 'failed', error: 'spawn ENOENT' },
              { name: 'linear', status: 'needs-auth' },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('<dt>MCP servers</dt>'));
    assert.ok(
      /class="mcp-server" data-status="connected"[^>]*>[\s\S]*?github[\s\S]*?Connected/.test(html)
    );
    assert.ok(/data-status="failed"[\s\S]*?db[\s\S]*?Failed[\s\S]*?spawn ENOENT/.test(html));
    assert.ok(/data-status="needs-auth"[\s\S]*?linear[\s\S]*?Needs authentication/.test(html));
  });

  test('セッションが動いていない時は、動いている間に出す旨だけ。サーバーが無ければ「なし」', () => {
    const idle = render(<App state={state({ mcp: { running: false } })} post={() => {}} />);
    assert.ok(idle.includes('Shown while Claude Code is running for this task'));
    const none = render(
      <App state={state({ mcp: { running: true, servers: [] } })} post={() => {}} />
    );
    assert.ok(/<dt>MCP servers<\/dt><dd>None<\/dd>/.test(none));
  });

  test('まだ聞いていない時は、MCP の行を出さない', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('MCP servers'));
  });
});
