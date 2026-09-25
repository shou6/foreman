import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Details } from '../../../webview/details/Details';
import type { DetailsState } from '../../../webview/detailsProtocol';
import { DETAILS_STRINGS } from '../../support/panelStrings';

const SESSION: NonNullable<DetailsState['session']> = {
  usage: { used: 165000, window: 1000000, ratio: 0.165 },
  canCompact: true,
  model: 'Sonnet 5',
  effort: 'Medium',
  permissionMode: 'acceptEdits',
  cwd: 'D:\\w\\dev-pj',
  alwaysAllowed: ['Bash(npm test)', 'WebFetch'],
};

function state(overrides: Partial<DetailsState> = {}): DetailsState {
  return {
    task: {
      id: 't1',
      title: 'Fix README',
      status: 'waiting',
      kind: 'replied',
      turnOpen: false,
      mergeable: false,
      turns: [],
    },
    session: SESSION,
    dockHeight: 240,
    strings: DETAILS_STRINGS,
    ...overrides,
  };
}

const SERVERS = [
  { name: 'github', status: 'connected' as const },
  { name: 'db', status: 'failed' as const, error: 'spawn ENOENT' },
  { name: 'linear', status: 'needs-auth' as const },
];

suite('webview: 右サイドバーの下の区画（セッション）', () => {
  test('覚えている高さで、上端に高さを変えるつまみを付けて出す。高さが無ければ 220px', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(/<div class="dock" style="height: ?240px;?"/.test(html), html.slice(0, 400));
    assert.ok(/class="dock-sash"[^>]*title="Drag to resize"/.test(html));
    const fallback = render(<Details state={state({ dockHeight: undefined })} post={() => {}} />);
    assert.ok(/<div class="dock" style="height: ?220px;?"/.test(fallback));
  });

  test('タスクが無い、またはセッションの情報が無ければ区画を出さない', () => {
    assert.ok(
      !render(<Details state={state({ session: undefined })} post={() => {}} />).includes(
        'class="dock"'
      )
    );
    assert.ok(
      !render(<Details state={state({ task: undefined })} post={() => {}} />).includes(
        'class="dock"'
      )
    );
  });

  test('タブは概要・MCP・常に許可（件数付き）。最初は概要', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    const tabs = [
      ...html.matchAll(
        /<button class="dock-tab"[^>]*aria-selected="(true|false)"[^>]*>([\s\S]*?)<\/button>/g
      ),
    ].map((m) => [m[2]?.replace(/<[^>]+>/g, ''), m[1]]);
    assert.deepStrictEqual(tabs, [
      ['Overview', 'true'],
      ['MCP', 'false'],
      ['Always allowed 2', 'false'],
    ]);
  });

  test('概要：コンテキストと圧縮、モデル、Effort、承認方式、ディレクトリ', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    const panel = html.slice(html.indexOf('class="dock-body"'));
    for (const text of [
      'Context',
      '165k / 1M',
      'Sonnet 5',
      'Medium',
      'acceptEdits',
      'D:\\w\\dev-pj',
    ]) {
      assert.ok(panel.includes(text), text);
    }
    assert.ok(/<button[^>]*class="icon-button compact"(?![^>]*disabled)/.test(panel));
    const busy = render(
      <Details state={state({ session: { ...SESSION, canCompact: false } })} post={() => {}} />
    );
    assert.ok(/<button[^>]*class="icon-button compact"[^>]*disabled/.test(busy));
  });

  test('MCP：失敗の件数をタブに添え、問題のある順に 1 行ずつ、名前と理由（または状態）を出す', () => {
    const html = render(
      <Details
        state={state({ mcp: { running: true, servers: SERVERS } })}
        post={() => {}}
        initialTab="mcp"
      />
    );
    assert.ok(
      /aria-selected="true"[^>]*>MCP<span class="tab-count" data-status="failed">1<\/span>/.test(
        html
      )
    );
    const rows = [
      ...html.matchAll(
        /<li class="mcp-row" data-status="([^"]+)"[^>]*><span class="mcp-name">([^<]*)<\/span><span class="mcp-why"[^>]*>([^<]*)<\/span><\/li>/g
      ),
    ].map((m) => [m[1], m[2], m[3]]);
    assert.deepStrictEqual(rows, [
      ['failed', 'db', 'spawn ENOENT'],
      ['needs-auth', 'linear', 'Needs authentication'],
      ['connected', 'github', 'Connected'],
    ]);
    assert.ok(/<button[^>]*class="icon-button refresh"/.test(html));
  });

  test('MCP：セッションが動いていなければ案内、サーバーが無ければ「なし」', () => {
    const idle = render(
      <Details state={state({ mcp: { running: false } })} post={() => {}} initialTab="mcp" />
    );
    assert.ok(idle.includes('Shown while Claude Code is running for this task'));
    const none = render(
      <Details
        state={state({ mcp: { running: true, servers: [] } })}
        post={() => {}}
        initialTab="mcp"
      />
    );
    assert.ok(/class="dock-empty"[^>]*>None</.test(none));
  });

  test('常に許可：ルールを 1 行ずつ。無ければ「なし」', () => {
    const html = render(<Details state={state()} post={() => {}} initialTab="rules" />);
    const rules = [...html.matchAll(/<li class="rule">([^<]*)<\/li>/g)].map((m) => m[1]);
    assert.deepStrictEqual(rules, ['Bash(npm test)', 'WebFetch']);
    const empty = render(
      <Details
        state={state({ session: { ...SESSION, alwaysAllowed: [] } })}
        post={() => {}}
        initialTab="rules"
      />
    );
    assert.ok(/class="dock-empty"[^>]*>None</.test(empty));
  });
});
