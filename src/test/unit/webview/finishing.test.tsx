import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
import { reduce } from '../../../webview/state';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    items: [],
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    worktree: { branch: 'foreman/x', base: 'main' },
    mergeable: true,
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: マージ中と破棄中', () => {
  test('finishing メッセージで状態に入り、undefined で消える', () => {
    let s = reduce(state({}), { type: 'finishing', kind: 'merge' });
    assert.strictEqual(s?.finishing, 'merge');
    s = reduce(s, { type: 'finishing', kind: undefined });
    assert.strictEqual(s?.finishing, undefined);
  });

  test('マージ中は見出しのボタンが「マージ中…」になり、押せない', () => {
    const html = render(<App state={state({ finishing: 'merge' })} post={() => {}} />);
    assert.ok(html.includes('Merging…'));
    assert.ok(/<button[^>]*class="head-action merge"[^>]*disabled/.test(html));
  });
});
