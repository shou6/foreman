import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Sidebar } from '../../../webview/sidebar/Sidebar';
import type { FromSidebar, SidebarState } from '../../../webview/sidebarProtocol';

const STRINGS = {
  newTask: 'New task',
  empty: 'No tasks yet. Create one to get started.',
  groups: {
    waiting: 'Waiting for input',
    running: 'Running',
    review: 'Review',
    draft: 'Draft',
    done: 'Done',
  },
  badges: {
    approval: 'Approval',
    replied: 'Replied',
    failed: 'Failed',
    interrupted: 'Interrupted',
    done: 'Done',
    draft: 'Draft',
  },
  minutes: '{0} min',
  files: '{0} files',
};

function state(overrides: Partial<SidebarState> = {}): SidebarState {
  return {
    groups: [
      {
        key: 'waiting',
        items: [
          {
            id: 'w1',
            title: 'Auth refactor',
            status: 'waiting',
            turnOpen: true,
            worktree: true,
            branch: 'foreman/auth',
            files: 3,
            badge: { kind: 'approval' },
          },
        ],
      },
      {
        key: 'running',
        items: [
          {
            id: 'r1',
            title: 'CSV encoding',
            status: 'running',
            turnOpen: true,
            worktree: false,
            files: 1,
            badge: { kind: 'elapsed', minutes: 4 },
          },
        ],
      },
      {
        key: 'done',
        items: [
          {
            id: 'd1',
            title: 'Old one',
            status: 'done',
            turnOpen: false,
            worktree: false,
            files: 0,
            badge: { kind: 'done' },
          },
        ],
      },
    ],
    activeTaskId: 'w1',
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 左サイドバーの一覧', () => {
  test('グループの見出しと件数、各タスクの題名を出す', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(html.includes('Waiting for input'));
    assert.ok(html.includes('Auth refactor'));
    assert.ok(html.includes('CSV encoding'));
    assert.strictEqual(html.split('class="group"').length - 1, 3);
  });

  test('バッジ: 承認待ち、経過分数、完了。2 行目にブランチとファイル数', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(/class="badge approval"[^>]*>Approval/.test(html));
    assert.ok(html.includes('4 min'));
    assert.ok(html.includes('foreman/auth'));
    assert.ok(html.includes('3 files'));
  });

  test('今見ているタスクに active が付き、状態の点に status が付く', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(/<div[^>]*class="task active"[^>]*data-task="w1"/.test(html));
    assert.ok(/class="dot"[^>]*data-status="running"/.test(html));
  });

  test('右クリックのメニュー用に data-vscode-context を付ける', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    const match = html.match(/data-task="w1"[^>]*data-vscode-context="([^"]*)"/);
    assert.ok(match, 'context が無い');
    const context = JSON.parse((match?.[1] ?? '').replace(/&quot;/g, '"')) as Record<
      string,
      unknown
    >;
    assert.strictEqual(context.taskId, 'w1');
    assert.strictEqual(context.foremanStatus, 'waiting');
    assert.strictEqual(context.foremanOpen, true);
    assert.strictEqual(context.foremanWorktree, true);
    assert.strictEqual(context.preventDefaultContextMenuItems, true);
  });

  test('完了のグループは初めからたたむ', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(/<details[^>]*class="group"[^>]*data-group="waiting"[^>]*open/.test(html));
    assert.ok(!/<details[^>]*class="group"[^>]*data-group="done"[^>]*open/.test(html));
  });

  test('タスクが無ければ案内を出す', () => {
    const html = render(<Sidebar state={state({ groups: [] })} post={() => {}} />);
    assert.ok(html.includes('No tasks yet'));
  });

  test('メッセージの型', () => {
    const messages: FromSidebar[] = [
      { type: 'ready' },
      { type: 'open', id: 'x' },
      { type: 'newTask' },
    ];
    assert.strictEqual(messages.length, 3);
  });
});
