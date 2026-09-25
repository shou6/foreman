import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import { McpServers } from '../../../webview/McpServers';
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

  const SERVERS = [
    { name: 'github', status: 'connected' as const, scope: 'user' },
    { name: 'db', status: 'failed' as const, error: 'spawn ENOENT' },
    { name: 'linear', status: 'needs-auth' as const },
    { name: 'slack', status: 'needs-auth' as const },
  ];

  test('状態ごとの件数をボタンで、問題のある順（失敗・認証が必要・接続中・接続済み・無効）に出す。最初は一覧を出さない', () => {
    const html = render(
      <App state={state({ mcp: { running: true, servers: SERVERS } })} post={() => {}} />
    );
    assert.ok(html.includes('<dt>MCP servers</dt>'));
    const counts = [
      ...html.matchAll(
        /<button class="mcp-count" data-status="([^"]+)" aria-pressed="false">([^<]*)<\/button>/g
      ),
    ].map((m) => [m[1], m[2]]);
    assert.deepStrictEqual(counts, [
      ['failed', 'Failed 1'],
      ['needs-auth', 'Needs authentication 2'],
      ['connected', 'Connected 1'],
    ]);
    assert.ok(!html.includes('mcp-chip'), '押すまで一覧は出さない');
  });

  test('押した状態のサーバーだけを、名前のチップで出す', () => {
    const html = render(
      <McpServers servers={SERVERS} strings={PANEL_STRINGS} initialStatus="needs-auth" />
    );
    assert.ok(
      html.includes('<button class="mcp-count" data-status="needs-auth" aria-pressed="true">')
    );
    const chips = [...html.matchAll(/<span class="mcp-chip"[^>]*>([^<]*)<\/span>/g)].map(
      (m) => m[1]
    );
    assert.deepStrictEqual(chips, ['linear', 'slack']);
  });

  test('失敗のチップは、マウスを乗せると理由が出る', () => {
    const html = render(
      <McpServers servers={SERVERS} strings={PANEL_STRINGS} initialStatus="failed" />
    );
    assert.ok(html.includes('<span class="mcp-chip" title="spawn ENOENT">db</span>'));
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
