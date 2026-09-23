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
  approve: 'Approve',
  markDone: 'Mark as done',
};

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    items: [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'turn-end', turn: 0, ok: true },
      { kind: 'prompt', turn: 1, text: 'q' },
      { kind: 'turn-end', turn: 1, ok: true },
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

suite('webview: チェックポイント', () => {
  test('正常に終わったターンごとに、番号と「ここに戻す」「ここから切り出す」を出す', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.strictEqual(html.split('class="checkpoint"').length - 1, 2);
    assert.ok(html.includes('Turn 1'));
    assert.ok(html.includes('Turn 2'));
    assert.ok(html.includes('Rewind to here'));
    assert.ok(html.includes('Fork from here'));
  });

  test('失敗や中断で終わったターンには出さない', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: false, interrupted: true, reason: 'stopped' },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(!html.includes('class="checkpoint"'));
  });

  test('実行中は押せない', () => {
    const html = render(
      <App state={state({ status: 'running', turnOpen: true })} post={() => {}} />
    );
    assert.ok(/<button[^>]*class="link rewind"[^>]*disabled/.test(html));
  });

  test('rewind と fork のメッセージの型がある', () => {
    const messages: ToExtension[] = [
      { type: 'rewind', turn: 0 },
      { type: 'fork', turn: 1 },
    ];
    assert.strictEqual(messages.length, 2);
  });
});

suite('webview: 承認（レビュー待ち）', () => {
  test('レビュー待ちの時だけ「承認」ボタンを出す', () => {
    const review = render(<App state={state({ status: 'review' })} post={() => {}} />);
    assert.ok(review.includes('class="ghost approve"'));
    assert.ok(review.includes('Approve'));
    const done = render(<App state={state({ status: 'done' })} post={() => {}} />);
    assert.ok(!done.includes('class="ghost approve"'));
  });

  test('approve のメッセージの型がある', () => {
    const message: ToExtension = { type: 'approve' };
    assert.strictEqual(message.type, 'approve');
  });
});
