import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
import type { FileChange } from '../../../domain/task';
import { Details } from '../../../webview/details/Details';
import { DETAILS_STRINGS, PANEL_STRINGS } from '../../support/panelStrings';

const CHANGE: FileChange = {
  path: 'src/a.ts',
  kind: 'modified',
  before: 'h1',
  after: 'h2',
  source: 'edit-tool',
  reverted: false,
  added: 1,
  removed: 1,
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
    ],
    changes: { 0: [CHANGE] },
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: PANEL_STRINGS,
    ...overrides,
  };
}

suite('webview: スナップショットを消したタスクの差分カード', () => {
  test('変更の一覧は残し、消した旨を出す。差分と戻す操作は出さない', () => {
    const html = render(<App state={state({ snapshotsPruned: true })} post={() => {}} />);
    assert.ok(html.includes('src/a.ts') || html.includes('a.ts'));
    assert.ok(/class="diff-pruned"[^>]*>Saved file contents were removed/.test(html));
    assert.ok(!html.includes('class="revert-all"'));
    assert.ok(!html.includes('icon-button revert'));
    assert.ok(!html.includes('icon-button open-diff'));
  });

  test('消していなければ、これまでどおり差分と戻す操作を出す', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('diff-pruned'));
    assert.ok(html.includes('icon-button open-diff'));
  });
});

suite('webview: スナップショットを消したタスクの、戻す操作', () => {
  test('タスク画面のチェックポイントの「ここに戻す」は押せない（ファイルを戻せないため）', () => {
    const html = render(<App state={state({ snapshotsPruned: true })} post={() => {}} />);
    assert.ok(/<button[^>]*class="checkpoint-action rewind"[^>]*disabled/.test(html));
  });

  test('右サイドバーの「戻す」「差分を開く」「ここに戻す」は表示したまま押せない。切り出しは押せる', () => {
    const html = render(
      <Details
        state={{
          task: {
            id: 't1',
            title: 'README',
            status: 'done',
            kind: 'done',
            turnOpen: false,
            mergeable: false,
            snapshotsPruned: true,
            turns: [
              {
                index: 0,
                prompt: 'p',
                ok: true,
                changes: [
                  { path: 'a.ts', kind: 'modified', added: 1, removed: 1, reverted: false },
                ],
              },
            ],
          },
          strings: DETAILS_STRINGS,
        }}
        post={() => {}}
      />
    );
    assert.ok(/<button[^>]*class="link revert"[^>]*disabled/.test(html));
    assert.ok(/<button[^>]*class="link open-diff"[^>]*disabled/.test(html));
    assert.ok(/<button[^>]*class="icon-button rewind"[^>]*disabled/.test(html));
    assert.ok(/<button[^>]*class="icon-button fork"(?![^>]*disabled)/.test(html));
  });
});
