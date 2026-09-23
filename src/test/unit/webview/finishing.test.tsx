import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
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
  approve: 'Approve',
  markDone: 'Mark as done',
};

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

  test('マージ中はボタンが「マージ中…」になり、マージも破棄も押せない', () => {
    const html = render(<App state={state({ finishing: 'merge' })} post={() => {}} />);
    assert.ok(html.includes('Merging…'));
    assert.ok(/<button[^>]*class="ghost merge"[^>]*disabled/.test(html));
    assert.ok(/<button[^>]*class="ghost discard"[^>]*disabled/.test(html));
  });

  test('破棄中は「破棄中…」', () => {
    const html = render(<App state={state({ finishing: 'discard' })} post={() => {}} />);
    assert.ok(html.includes('Discarding…'));
  });
});
