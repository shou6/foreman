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
    models: [],
    maxWidthEm: 72,
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: worktree', () => {
  test('worktree を使うタスクは、見出しにブランチのチップと、マージ・破棄のボタンを出す', () => {
    const html = render(
      <App
        state={state({ worktree: { branch: 'foreman/readme-abc123', base: 'main' } })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('foreman/readme-abc123'));
    assert.ok(html.includes('Merge into main'));
    assert.ok(html.includes('Discard'));
  });

  test('worktree を使わないタスクには出さない', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('Merge into'));
    assert.ok(!html.includes('Discard'));
  });

  test('実行中はマージと破棄を押せない', () => {
    const html = render(
      <App
        state={state({ status: 'running', worktree: { branch: 'foreman/x', base: 'main' } })}
        post={() => {}}
      />
    );
    assert.ok(/<button[^>]*class="ghost merge"[^>]*disabled/.test(html));
  });

  test('merge と discard のメッセージの型がある', () => {
    const messages: ToExtension[] = [{ type: 'merge' }, { type: 'discard' }];
    assert.strictEqual(messages.length, 2);
  });
});
