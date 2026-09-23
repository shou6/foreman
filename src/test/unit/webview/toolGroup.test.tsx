import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';

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
  changes: 'Changes in this turn',
  files: 'files',
  openDiff: 'Open diff',
  revert: 'Revert',
  reverted: 'Reverted',
  unknownBefore: 'Previous content unknown',
  model: 'Model',
  defaultModel: 'Default',
  attachments: 'Attachments',
  remove: 'Remove',
  dropHint: 'Drop files here',
  statusLabels: {
    running: 'Running',
    waiting: 'Waiting for input',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
  worktree: 'worktree',
  merge: 'Merge into {0}',
  discard: 'Discard',
  toolCalls: '{0} tool calls',
  export: 'Export',
};

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    items: [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'tool', turn: 0, id: '1', name: 'Read', input: { file_path: 'a.ts' }, status: 'ok' },
      { kind: 'tool', turn: 0, id: '2', name: 'Bash', input: { command: 'ls' }, status: 'error' },
      { kind: 'tool', turn: 0, id: '3', name: 'Grep', input: { pattern: 'x' }, status: 'running' },
    ],
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: ツールの呼び出しのたたみ', () => {
  test('既定ではたたみ、件数と成否とツール名の要約を出す', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(/<details[^>]*class="tool-group[^"]*"(?![^>]*\bopen\b)/.test(html), 'たたまれている');
    assert.ok(html.includes('3 tool calls'));
    assert.ok(html.includes('✓1'));
    assert.ok(html.includes('✗1'));
    assert.ok(html.includes('Read, Bash, Grep'));
  });

  test('設定で開いた状態にできる', () => {
    const html = render(<App state={state({ toolCallsExpanded: true })} post={() => {}} />);
    assert.ok(/<details[^>]*class="tool-group[^"]*"[^>]*\bopen\b/.test(html));
  });

  test('実行中のツールがあるグループは、たたみの設定でも開く', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'tool', turn: 0, id: '1', name: 'Read', input: {}, status: 'running' },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/<details[^>]*class="tool-group[^"]*"[^>]*\bopen\b/.test(html));
  });

  test('見出しにエクスポートのボタンがあり、export のメッセージの型がある', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(html.includes('>Export<'));
    const message: ToExtension = { type: 'export' };
    assert.strictEqual(message.type, 'export');
  });
});
