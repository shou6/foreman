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
  pass: 'Pass along',
  selection: 'Selection',
  diagnostics: 'Diagnostics',
  gitDiff: 'git diff',
  addFile: '+ File',
  statusLabels: {
    draft: 'Draft',
    running: 'Running',
    waiting: 'Waiting for input',
    review: 'Review',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
  worktree: 'worktree',
  merge: 'Merge into {0}',
  discard: 'Discard',
  toolCalls: '{0} tool calls',
  export: 'Export',
  merging: 'Merging…',
  discarding: 'Discarding…',
  alwaysScope: '"Always allow" would allow',
  turn: 'Turn {0}',
  rewindHere: 'Rewind to here',
  forkHere: 'Fork from here',
  revertAll: 'Revert all',
  contextUsage: 'Context',
  approve: 'Approve',
  markDone: 'Mark as done',
};

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
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: worktree', () => {
  test('worktree を使うタスクは、見出しにブランチのチップと、マージ・破棄のボタンを出す', () => {
    const html = render(
      <App
        state={state({
          worktree: { branch: 'foreman/readme-abc123', base: 'main' },
          mergeable: true,
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('foreman/readme-abc123'));
    assert.ok(html.includes('Merge into main'));
    assert.ok(html.includes('Discard'));
  });

  test('マージできない（未承認か、変更が無い）間はマージのボタンを出さない。破棄は出す', () => {
    const html = render(
      <App
        state={state({
          status: 'review',
          worktree: { branch: 'foreman/x', base: 'main' },
          mergeable: false,
        })}
        post={() => {}}
      />
    );
    assert.ok(!html.includes('class="ghost merge"'));
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
        state={state({
          status: 'running',
          turnOpen: true,
          worktree: { branch: 'foreman/x', base: 'main' },
          mergeable: true,
        })}
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
