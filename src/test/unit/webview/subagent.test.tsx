import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
import type { TranscriptItem } from '../../../domain/transcript';
import { PANEL_STRINGS } from '../../support/panelStrings';

function state(items: TranscriptItem[], overrides: Partial<PanelState> = {}): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    mergeable: false,
    items,
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: true,
    presets: [],
    context: { cwd: 'D:\\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: PANEL_STRINGS,
    ...overrides,
  };
}

const agent = (status: 'running' | 'ok'): TranscriptItem => ({
  kind: 'tool',
  turn: 0,
  id: 'agent-1',
  name: 'Agent',
  input: { description: 'Find usages' },
  status,
});

const child = (id: string, name: string, status: 'running' | 'ok'): TranscriptItem => ({
  kind: 'tool',
  turn: 0,
  id,
  name,
  input: { pattern: id },
  status,
  parentId: 'agent-1',
});

suite('webview: サブエージェントの活動', () => {
  test('サブエージェントの呼び出しは、親（Agent）の行の中に入れ子で出し、グループの件数と名前には数えない', () => {
    const html = render(
      <App
        state={state([
          { kind: 'prompt', turn: 0, text: 'p' },
          agent('ok'),
          child('c1', 'Grep', 'ok'),
          child('c2', 'Read', 'ok'),
          { kind: 'tool', turn: 0, id: 't2', name: 'Edit', input: {}, status: 'ok' },
        ])}
        post={() => {}}
      />
    );
    assert.ok(html.includes('2 tool calls'), 'グループは親と Edit の 2 件');
    assert.ok(html.includes('class="tool-names">Agent, Edit<'), '子の名前は要約に出さない');
    assert.ok(
      /<details class="tool" data-status="ok"><summary><span class="tool-name">Agent<\/span>[\s\S]*?<div class="subagent-tools">[\s\S]*?<span class="tool-name">Grep<\/span>[\s\S]*?<span class="tool-name">Read<\/span>[\s\S]*?<\/div><\/details>/.test(
        html
      ),
      '子は親の details の中'
    );
    assert.ok(/class="subagent-count"[^>]*>2 tool calls</.test(html), '親の行に子の件数');
  });

  test('サブエージェントの実行中は、親の実行中の行に、今動いている子のツールを添える', () => {
    const html = render(
      <App
        state={state(
          [
            { kind: 'prompt', turn: 0, text: 'p' },
            agent('running'),
            child('c1', 'Grep', 'ok'),
            child('c2', 'Read', 'running'),
          ],
          { status: 'running', turnOpen: true }
        )}
        post={() => {}}
      />
    );
    const running = html.slice(html.indexOf('class="tool-running"'));
    assert.ok(/<span class="tool-name">Agent<\/span>/.test(running));
    assert.ok(/class="tool-sub"[^>]*>[\s\S]*?Read[\s\S]*?c2/.test(running), '動いている子');
    assert.strictEqual(
      html.split('class="tool-running"').length - 1,
      1,
      '子の実行中の行は別に出さない'
    );
  });
});
