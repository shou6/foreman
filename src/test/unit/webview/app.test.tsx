import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
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
};

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'running',
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

suite('webview App', () => {
  test('state が無い間は空', () => {
    assert.strictEqual(render(<App state={undefined} post={() => {}} />), '');
  });

  test('指示、出力、ツールの呼び出しを並べる', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'Fix <it>' },
            { kind: 'text', turn: 0, text: 'Sure' },
            {
              kind: 'tool',
              turn: 0,
              id: 't1',
              name: 'Edit',
              input: { file_path: 'a.txt' },
              status: 'ok',
              output: 'done',
            },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('Fix &lt;it') && !html.includes('<it>'), 'HTML はエスケープされる');
    assert.ok(html.includes('Sure'));
    assert.ok(html.includes('Edit'));
    assert.ok(html.includes('a.txt'));
    assert.ok(html.includes('data-status="ok"'));
  });

  test('実行中は Stop、それ以外は Send のボタンを出す', () => {
    assert.ok(
      render(<App state={state({ status: 'running' })} post={() => {}} />).includes('Stop')
    );
    assert.ok(render(<App state={state({ status: 'done' })} post={() => {}} />).includes('Send'));
  });

  test('失敗したターンは理由を出す', () => {
    const html = render(
      <App
        state={state({
          status: 'failed',
          items: [{ kind: 'turn-end', turn: 0, ok: false, interrupted: false, reason: 'API down' }],
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('API down'));
  });
});
