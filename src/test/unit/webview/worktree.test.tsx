import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

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
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: worktree', () => {
  test('worktree を使うタスクは、見出しの 2 行目にブランチと行き先を出す。破棄は見出しに置かない', () => {
    const html = render(
      <App
        state={state({
          worktree: { branch: 'foreman/readme-abc123', base: 'main' },
          mergeable: true,
        })}
        post={() => {}}
      />
    );
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    assert.ok(
      /class="head-meta"[\s\S]*?codicon-git-branch[\s\S]*?foreman\/readme-abc123 → main/.test(
        header
      )
    );
    assert.ok(/class="head-action merge"[^>]*>Merge into main</.test(header));
    assert.ok(!html.includes('Discard'));
  });

  test('マージできない（未承認か、変更が無い）間はマージのボタンを出さない', () => {
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
    assert.ok(!html.includes('class="head-action merge"'));
  });

  test('worktree を使わないタスクには出さない', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('Merge into'));
    assert.ok(!html.includes('codicon-git-branch'));
  });

  test('実行中はマージを押せない', () => {
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
    assert.ok(/<button[^>]*class="head-action merge"[^>]*disabled/.test(html));
  });

  test('merge のメッセージの型がある', () => {
    const messages: ToExtension[] = [{ type: 'merge' }];
    assert.strictEqual(messages.length, 1);
  });
});
