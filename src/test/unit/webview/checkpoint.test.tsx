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
  rename: 'Rename',
  contextPanel: 'What Claude will receive',
  contextEmpty: 'Type a prompt to preview what will be sent.',
  presetsHint: 'Presets: {0}',
  permissionMode: 'Permission mode',
  alwaysAllowedList: 'Always allowed in this task',
  directory: 'Directory',
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
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
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
  const changes = {
    1: [
      { path: 'a.txt', kind: 'modified' as const, source: 'edit-tool' as const, reverted: false },
    ],
  };

  test('レビュー待ちの最後のターンの差分カードに「すべて戻す」と「承認」を出す。ヘッダーには出さない', () => {
    const review = render(<App state={state({ status: 'review', changes })} post={() => {}} />);
    assert.ok(/class="diff-card"[\s\S]*class="revert-all"/.test(review));
    assert.ok(/class="diff-card"[\s\S]*class="approve primary"/.test(review));
    assert.ok(!review.includes('class="ghost approve"'));
    const done = render(<App state={state({ status: 'done', changes })} post={() => {}} />);
    assert.ok(!done.includes('class="approve primary"'));
    assert.ok(done.includes('class="revert-all"'), 'すべて戻すは完了後も使える');
  });

  test('返答を待っているタスク（ターン終了後の入力待ち）は、ヘッダーに「完了にする」を出す', () => {
    const html = render(
      <App state={state({ status: 'waiting', turnOpen: false })} post={() => {}} />
    );
    assert.ok(html.includes('class="ghost approve"'));
    assert.ok(html.includes('Mark as done'));
  });

  test('approve と revertAll のメッセージの型がある', () => {
    const messages: ToExtension[] = [{ type: 'approve' }, { type: 'revertAll', turn: 1 }];
    assert.strictEqual(messages.length, 2);
  });
});

suite('webview: コンテキストのメーター（M11）', () => {
  test('使用量があれば見出しにメーターと「84k / 200k」を出す', () => {
    const html = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          usage: { used: 84000, window: 200000, ratio: 0.42 },
        })}
        post={() => {}}
      />
    );
    assert.ok(/class="meter"[^>]*title="[^"]*42%/.test(html));
    assert.ok(html.includes('84k / 200k'));
    assert.ok(/class="meter-fill"[^>]*style="width: 42%/.test(html));
  });

  test('使用量が無ければメーターを出さない', () => {
    const html = render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />);
    assert.ok(!html.includes('class="meter"'));
  });

  test('ターンの区切りにトークン数を出す', () => {
    const html = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          tokens: { 1: { input: 84000, output: 500 } },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('84k'));
    assert.ok(html.includes('500'));
    assert.ok(/class="checkpoint"[\s\S]*class="turn-tokens"/.test(html));
  });
});
