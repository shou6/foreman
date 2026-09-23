import * as assert from 'assert';
import { reduce } from '../../../webview/state';
import type { PanelState } from '../../../webview/protocol';

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
    draft: 'Draft',
    running: 'Running',
    waiting: 'Waiting for input',
    review: 'Review',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
  model: 'Model',
  defaultModel: 'Default',
  attachments: 'Attachments',
  remove: 'Remove',
  dropHint: 'Drop files here to attach (hold Shift in the editor area)',
  pass: 'Pass along',
  selection: 'Selection',
  diagnostics: 'Diagnostics',
  gitDiff: 'git diff',
  addFile: '+ File',
  worktree: 'worktree',
  merge: 'Merge into {0}',
  discard: 'Discard',
  toolCalls: '{0} tool calls',
  export: 'Export',
  rename: 'Rename',
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

const initial: PanelState = {
  taskId: 'task-1',
  title: 'README',
  status: 'running',
  turnOpen: true,
  mergeable: false,
  items: [],
  changes: {},
  diffs: {},
  attachments: [],
  models: [],
  maxWidthEm: 72,
  toolCallsExpanded: false,
  strings: STRINGS,
};

suite('webview reduce', () => {
  test('state で全体を置き換える', () => {
    assert.deepStrictEqual(reduce(undefined, { type: 'state', state: initial }), initial);
  });

  test('state が届く前のイベントは無視する', () => {
    assert.strictEqual(reduce(undefined, { type: 'turn-start', turn: 0, prompt: 'p' }), undefined);
  });

  test('turn-start と event で履歴が伸びる', () => {
    let state = reduce(initial, { type: 'turn-start', turn: 0, prompt: 'p' });
    state = reduce(state, { type: 'event', turn: 0, event: { type: 'text', text: 'hi' } });
    assert.deepStrictEqual(state?.items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'text', turn: 0, text: 'hi' },
    ]);
  });

  test('task で状態とタイトルとモデルが変わる', () => {
    const state = reduce(initial, {
      type: 'task',
      status: 'done',
      turnOpen: false,
      mergeable: false,
      title: 'New title',
      model: 'claude-sonnet-5',
    });
    assert.strictEqual(state?.status, 'done');
    assert.strictEqual(state?.title, 'New title');
    assert.strictEqual(state?.model, 'claude-sonnet-5');
    assert.deepStrictEqual(state?.items, []);
  });
});

suite('reduce: truncate', () => {
  test('指定のターンより後の履歴、変更、差分を消す', () => {
    const base = reduce(undefined, {
      type: 'state',
      state: {
        taskId: 't',
        title: 'T',
        status: 'done',
        turnOpen: false,
        mergeable: false,
        items: [
          { kind: 'prompt', turn: 0, text: 'a' },
          { kind: 'turn-end', turn: 0, ok: true },
          { kind: 'prompt', turn: 1, text: 'b' },
          { kind: 'turn-end', turn: 1, ok: true },
        ],
        changes: {
          0: [{ path: 'x', kind: 'modified', source: 'watcher', reverted: false }],
          1: [{ path: 'y', kind: 'modified', source: 'watcher', reverted: false }],
        },
        diffs: { '0:x': [], '1:y': [] },
        attachments: [],
        models: [],
        maxWidthEm: 72,
        toolCallsExpanded: false,
        strings: STRINGS,
      },
    });
    const next = reduce(base, { type: 'truncate', afterTurn: 0 });
    assert.deepStrictEqual(next?.items, [
      { kind: 'prompt', turn: 0, text: 'a' },
      { kind: 'turn-end', turn: 0, ok: true },
    ]);
    assert.deepStrictEqual(Object.keys(next?.changes ?? {}), ['0']);
    assert.deepStrictEqual(Object.keys(next?.diffs ?? {}), ['0:x']);
  });
});
