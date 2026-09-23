import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';
import { reduce } from '../../../webview/state';

const STRINGS = {
  send: 'Send',
  stop: 'Stop',
  running: 'Running…',
  allow: 'Allow',
  allowAlways: 'Always allow in this task',
  deny: 'Deny',
  denyReason: 'Reason (optional)',
  answer: 'Answer',
  waiting: 'Waiting for your input',
  changes: 'Changes',
  files: 'files',
  openDiff: 'Open in diff editor',
  revert: 'Revert',
  reverted: 'Reverted',
  unknownBefore: 'Previous content unknown',
  statusLabels: {
    running: 'Running',
    waiting: 'Waiting for input',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
  model: 'Model',
  defaultModel: 'Default',
  attachments: 'Attachments',
  remove: 'Remove',
  dropHint: 'Drop files here to attach (hold Shift in the editor area)',
  worktree: 'worktree',
  merge: 'Merge into {0}',
  discard: 'Discard',
  toolCalls: '{0} tool calls',
  export: 'Export',
  merging: 'Merging…',
  discarding: 'Discarding…',
  alwaysScope: '"Always allow" would allow',
};

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    items: [],
    changes: {},
    diffs: {},
    attachments: [],
    models: ['claude-opus-5', 'claude-sonnet-5'],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 添付とモデル', () => {
  test('attachments メッセージで添付の一覧が入れ替わる', () => {
    const s = reduce(state({}), { type: 'attachments', paths: ['a.ts', 'b.md'] });
    assert.deepStrictEqual(s?.attachments, ['a.ts', 'b.md']);
  });

  test('添付があれば入力欄の上にチップとして出す', () => {
    const html = render(<App state={state({ attachments: ['D:\\w\\a.ts'] })} post={() => {}} />);
    assert.ok(html.includes('class="attachment'));
    assert.ok(html.includes('a.ts'));
    assert.ok(html.includes('Remove'));
  });

  test('モデルの選択肢と、既定を選ぶ項目を出す。指定中のモデルが選ばれている', () => {
    const html = render(<App state={state({ model: 'claude-sonnet-5' })} post={() => {}} />);
    assert.ok(html.includes('<select'));
    assert.ok(html.includes('Default'));
    assert.ok(/<option[^>]*value="claude-sonnet-5"[^>]*selected/.test(html));
    assert.ok(html.includes('claude-opus-5'));
  });

  test('一覧に無いモデルが指定されていても選択肢に出す', () => {
    const html = render(<App state={state({ model: 'claude-custom' })} post={() => {}} />);
    assert.ok(/<option[^>]*value="claude-custom"[^>]*selected/.test(html));
  });

  test('実際に動いているモデルが指定と違えば、その名前も出す', () => {
    const html = render(
      <App state={state({ model: undefined, activeModel: 'claude-opus-5[1m]' })} post={() => {}} />
    );
    assert.ok(html.includes('claude-opus-5[1m]'));
  });

  test('setModel、dropped、添付つきの send の型がある', () => {
    const messages: ToExtension[] = [
      { type: 'setModel', model: 'claude-opus-5' },
      { type: 'setModel', model: undefined },
      { type: 'dropped', uris: ['file:///d%3A/w/a.ts'] },
      { type: 'send', prompt: 'p', attachments: ['D:\\w\\a.ts'] },
      { type: 'removeAttachment', path: 'D:\\w\\a.ts' },
    ];
    assert.strictEqual(messages.length, 5);
  });
});

suite('webview: 状態の表示名', () => {
  test('状態のバッジは翻訳した表示名を出す', () => {
    const html = render(<App state={state({ status: 'done' })} post={() => {}} />);
    assert.ok(html.includes('>Done<'));
    assert.ok(!html.includes('>done<'));
  });
});
