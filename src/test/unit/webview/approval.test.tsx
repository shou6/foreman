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
};

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'waiting',
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

suite('webview: 承認カード', () => {
  test('pending メッセージで承認の要求が状態に入り、undefined で消える', () => {
    const pending = {
      id: 'req-1',
      toolName: 'Edit',
      input: { file_path: 'a.txt' },
      suggestions: [],
    };
    let s = reduce(state({}), { type: 'pending', pending });
    assert.deepStrictEqual(s?.pending, pending);
    s = reduce(s, { type: 'pending', pending: undefined });
    assert.strictEqual(s?.pending, undefined);
  });

  test('ツールの承認カードに、ツール名、対象、許可・常に許可・拒否のボタンを出す', () => {
    const html = render(
      <App
        state={state({
          pending: {
            id: 'req-1',
            toolName: 'Bash',
            input: { command: 'npm test' },
            suggestions: [{ type: 'addRules' }],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="approval'));
    assert.ok(html.includes('Bash'));
    assert.ok(html.includes('npm test'));
    assert.ok(html.includes('Allow'));
    assert.ok(html.includes('Always allow in this task'));
    assert.ok(html.includes('Deny'));
  });

  test('提案が無ければ「常に許可」は出さない', () => {
    const html = render(
      <App
        state={state({
          pending: { id: 'req-1', toolName: 'Bash', input: { command: 'ls' }, suggestions: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(!html.includes('Always allow in this task'));
  });

  test('AskUserQuestion は質問と選択肢のカードになる', () => {
    const html = render(
      <App
        state={state({
          pending: {
            id: 'req-1',
            toolName: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Which section?',
                  header: 'Section',
                  multiSelect: false,
                  options: [
                    { label: 'Usage', description: 'Add to Usage' },
                    { label: 'New', description: 'Create a new section' },
                  ],
                },
              ],
            },
            suggestions: [],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="question'));
    assert.ok(html.includes('Which section?'));
    assert.ok(html.includes('Usage'));
    assert.ok(html.includes('Add to Usage'));
    assert.ok(html.includes('type="radio"'));
    assert.ok(html.includes('Answer'));
    assert.ok(!html.includes('Always allow in this task'));
  });

  test('承認待ちの間は、入力欄の代わりに待っている旨を出す', () => {
    const html = render(
      <App
        state={state({
          pending: { id: 'req-1', toolName: 'Edit', input: {}, suggestions: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('Waiting for your input'));
  });

  test('decision メッセージの型が protocol にある', () => {
    const message: ToExtension = {
      type: 'decision',
      requestId: 'req-1',
      decision: { behavior: 'allow' },
    };
    assert.strictEqual(message.type, 'decision');
  });
});

suite('webview: 常に許可の中身', () => {
  test('提案されたルールの内容を「常に許可」の下に出す', () => {
    const html = render(
      <App
        state={state({
          pending: {
            id: 'req-1',
            toolName: 'Bash',
            input: { command: 'git status' },
            suggestions: [
              {
                type: 'addRules',
                behavior: 'allow',
                destination: 'session',
                rules: [{ toolName: 'Bash', ruleContent: 'git status' }],
              },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="always-scope"'));
    assert.ok(html.includes('Bash(git status)'));
  });
});
