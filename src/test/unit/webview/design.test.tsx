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
    models: ['claude-opus-5'],
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: ラフに寄せた表示', () => {
  test('連続するツールの呼び出しは 1 つのグループにまとめ、出力を挟むと分かれる', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            {
              kind: 'tool',
              turn: 0,
              id: '1',
              name: 'Read',
              input: { file_path: 'a.ts' },
              status: 'ok',
            },
            { kind: 'tool', turn: 0, id: '2', name: 'Grep', input: { pattern: 'x' }, status: 'ok' },
            { kind: 'text', turn: 0, text: 'found' },
            {
              kind: 'tool',
              turn: 0,
              id: '3',
              name: 'Edit',
              input: { file_path: 'a.ts' },
              status: 'running',
            },
          ],
        })}
        post={() => {}}
      />
    );
    assert.strictEqual(html.split('class="tool-group').length - 1, 2);
    assert.ok(html.includes('data-status="running"'));
    assert.ok(html.includes('Grep'));
  });

  test('差分カードの見出しに、ファイル数と追加・削除の合計を出す', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: true },
          ],
          changes: {
            0: [
              {
                path: 'src/a.ts',
                kind: 'modified',
                before: 'h',
                after: 'h2',
                source: 'edit-tool',
                reverted: false,
                added: 6,
                removed: 14,
              },
              {
                path: 'src/b.ts',
                kind: 'created',
                after: 'h3',
                source: 'edit-tool',
                reverted: false,
                added: 31,
                removed: 0,
              },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('Changes in this turn'));
    assert.ok(html.includes('2 files'));
    assert.ok(html.includes('+37'));
    assert.ok(html.includes('-14'));
    // ファイル名とフォルダを分けて出す
    assert.ok(html.includes('>a.ts<'));
    assert.ok(html.includes('src/'));
  });

  test('モデルの選択は入力欄の行にあり、見出しには出さない', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    assert.ok(!header.includes('<select'));
    const footer = html.slice(html.indexOf('<footer'));
    assert.ok(footer.includes('<select'));
  });
});
