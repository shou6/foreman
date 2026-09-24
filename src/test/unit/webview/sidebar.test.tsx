import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Sidebar } from '../../../webview/sidebar/Sidebar';
import type { FromSidebar, SidebarState } from '../../../webview/sidebarProtocol';

const STRINGS = {
  newTask: 'New task',
  empty: 'No tasks yet. Create one to get started.',
  groups: {
    waiting: 'Your turn',
    running: 'Running',
    review: 'Review',
    draft: 'Draft',
    done: 'Done',
  },
  badges: {
    approval: 'Needs approval',
    question: 'Question',
    replied: 'Replied',
    failed: 'Failed',
    interrupted: 'Interrupted',
    draft: 'Draft',
  },
  minutes: '{0} min',
  files: '{0} files',
  ago: {
    now: 'just now',
    minutes: '{0}m ago',
    hours: '{0}h ago',
    yesterday: 'yesterday',
    days: '{0}d ago',
  },
  today: 'Tokens today (all tasks)',
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
            mergeable: false,
            unapprovable: false,
            branch: 'auth',
            files: 3,
            kind: 'approval',
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
            mergeable: false,
            unapprovable: false,
            files: 1,
            kind: 'running',
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
            mergeable: false,
            unapprovable: false,
            files: 0,
            kind: 'done',
            badge: { kind: 'ago', ago: { unit: 'minutes', value: 10 } },
          },
        ],
      },
    ],
    activeTaskId: 'w1',
    today: 0,
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 左サイドバーの一覧', () => {
  test('グループの見出しと件数、各タスクの題名を出す', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(html.includes('Your turn'));
    assert.ok(html.includes('Auth refactor'));
    assert.ok(html.includes('CSV encoding'));
    assert.strictEqual(html.split('class="group"').length - 1, 3);
  });

  test('バッジ: 承認待ち、経過分数。2 行目にブランチとファイル数', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(/class="badge approval"[^>]*>Needs approval/.test(html));
    assert.ok(html.includes('4 min'));
    assert.ok(html.includes('>auth<'));
    assert.ok(html.includes('3 files'));
  });

  test('完了の行にはバッジを出さず、終わった時刻を控えめに出す。0 ファイルは出さない', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(/class="ago"[^>]*>10m ago/.test(html));
    assert.ok(!html.includes('class="badge done"'));
    assert.ok(!html.includes('0 files'));
  });

  test('2 行目が空なら 2 行目を出さない', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    const done = html.slice(html.indexOf('data-task="d1"'));
    assert.ok(!done.includes('class="task-sub"'));
  });

  test('質問ありと返答済みのバッジ', () => {
    const html = render(
      <Sidebar
        state={state({
          groups: [
            {
              key: 'waiting',
              items: [
                {
                  id: 'q',
                  title: 'Q',
                  status: 'waiting',
                  turnOpen: true,
                  worktree: false,
                  mergeable: false,
                  unapprovable: false,
                  files: 0,
                  kind: 'question',
                  badge: { kind: 'question' },
                },
                {
                  id: 'r',
                  title: 'R',
                  status: 'waiting',
                  turnOpen: false,
                  worktree: false,
                  mergeable: false,
                  unapprovable: false,
                  files: 0,
                  kind: 'replied',
                  badge: { kind: 'replied' },
                },
              ],
            },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/class="badge question"[^>]*>Question/.test(html));
    assert.ok(/class="badge replied"[^>]*>Replied/.test(html));
  });

  test('状態は点ではなくアイコンで見せる（実行中は回る）', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(!html.includes('class="dot"'));
    assert.ok(
      /class="codicon codicon-sync codicon-modifier-spin status-icon"[^>]*data-kind="running"/.test(
        html
      )
    );
    assert.ok(/class="codicon codicon-shield status-icon"[^>]*data-kind="approval"/.test(html));
    assert.ok(/class="codicon codicon-check status-icon"[^>]*data-kind="done"/.test(html));
  });

  test('今見ているタスクに active が付く', () => {
    const html = render(<Sidebar state={state()} post={() => {}} />);
    assert.ok(/<div[^>]*class="task active"[^>]*data-task="w1"/.test(html));
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
    assert.strictEqual(context.foremanMergeable, false);
    assert.strictEqual(context.foremanUnapprovable, false);
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

suite('webview: 左サイドバーの下端（今日のトークン）', () => {
  test('今日のトークンの合計だけを下端に出す。コンテキストの使用量はタスク画面のヘッダーだけに出す', () => {
    const html = render(<Sidebar state={state({ today: 1250000 })} post={() => {}} />);
    assert.ok(html.includes('class="footer"'));
    assert.ok(html.includes('Tokens today (all tasks)'));
    assert.ok(html.includes('1.3M'));
    assert.ok(!html.includes('class="context"'));
    assert.ok(!html.includes('meter-fill'));
  });
});
