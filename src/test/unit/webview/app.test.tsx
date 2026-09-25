import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';
import { reduce } from '../../../webview/state';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

function state(overrides: Partial<PanelState>): PanelState {
  return {
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
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
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
      render(<App state={state({ status: 'running', turnOpen: true })} post={() => {}} />).includes(
        'Stop'
      )
    );
    assert.ok(
      render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />).includes(
        'Send'
      )
    );
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

suite('webview: 渡すもの（入力欄の添付）', () => {
  test('選択範囲・診断・git diff・ファイルのボタンを、入力欄と同じ枠のツールバーに、アイコンとラベルで出す', () => {
    const html = render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />);
    const box = html.slice(html.indexOf('class="composer-box"'));
    const toolbar = box.slice(box.indexOf('class="composer-toolbar"'));
    assert.ok(box.indexOf('class="prompt-input"') < box.indexOf('class="composer-toolbar"'));
    assert.ok(
      /class="tool selection"[^>]*>(<i[^>]*codicon-selection[^>]*><\/i>)Selection/.test(toolbar)
    );
    assert.ok(
      /class="tool diagnostics"[^>]*>(<i[^>]*codicon-warning[^>]*><\/i>)Diagnostics/.test(toolbar)
    );
    assert.ok(
      /class="tool git-diff"[^>]*>(<i[^>]*codicon-git-compare[^>]*><\/i>)git diff/.test(toolbar)
    );
    assert.ok(
      /class="tool pick-files"[^>]*>(<i[^>]*codicon-file-add[^>]*><\/i>)File/.test(toolbar)
    );
    assert.ok(!html.includes('+ git diff'));
    assert.ok(!html.includes('class="pass-label"'));
  });

  test('添付は種類ごとの見出しで並び、消せる', () => {
    const html = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          attachments: [
            { kind: 'file', path: 'D:\\w\\src\\a.ts' },
            { kind: 'selection', path: 'src/b.ts', startLine: 22, endLine: 40, text: 'x' },
            { kind: 'diagnostics', count: 2, text: 'e' },
            { kind: 'gitDiff', files: 3, text: 'd' },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('a.ts'));
    assert.ok(html.includes('src/b.ts:22-40'));
    assert.ok(html.includes('Diagnostics 2'));
    assert.ok(html.includes('git diff 3'));
    assert.strictEqual(html.split('class="attachment"').length - 1, 4);
  });

  test('メッセージの型', () => {
    const messages: ToExtension[] = [
      { type: 'attachSelection' },
      { type: 'attachDiagnostics' },
      { type: 'attachGitDiff' },
      { type: 'pickFiles' },
      { type: 'removeAttachment', key: 'file:a' },
      { type: 'send', prompt: 'p', attachments: [{ kind: 'file', path: 'a' }] },
    ];
    assert.strictEqual(messages.length, 6);
  });
});

suite('webview: 入力の途中の保持と画像の貼り付け', () => {
  test('initialDraft を渡すと入力欄にその文が入る（画面を隠しても消えないように）', () => {
    const html = render(
      <App
        state={state({ status: 'done', turnOpen: false })}
        post={() => {}}
        initialDraft="writing…"
      />
    );
    assert.ok(html.includes('writing…'));
  });

  test('入力が変わると onDraftChange で知らせる型がある', () => {
    let seen = '';
    render(
      <App
        state={state({ status: 'done', turnOpen: false })}
        post={() => {}}
        onDraftChange={(d) => {
          seen = d;
        }}
      />
    );
    assert.strictEqual(seen, '');
  });

  test('pasteImage のメッセージの型がある', () => {
    const message: ToExtension = { type: 'pasteImage', mime: 'image/png', data: 'AAAA' };
    assert.strictEqual(message.type, 'pasteImage');
  });
});

suite('webview: 指示のプリセット（M13）', () => {
  const presets = [
    { name: 'fix', prompt: 'Fix: {input}' },
    { name: 'test', prompt: 'Test: {input}' },
  ];

  test('入力が / で始まる間は、候補の一覧を出す', () => {
    const html = render(
      <App
        state={state({ status: 'done', turnOpen: false, presets })}
        post={() => {}}
        initialDraft="/t"
      />
    );
    const list = html.slice(html.indexOf('class="preset-list"'), html.indexOf('</ul>'));
    assert.ok(list.length > 0, '候補の一覧が無い');
    assert.ok(list.includes('/test'));
    assert.ok(!list.includes('/fix'));
  });

  test('入力が / で始まらなければ候補を出さない。入力欄の案内は 1 行で、/ でプリセットを出せることを書く', () => {
    const html = render(
      <App
        state={state({ status: 'done', turnOpen: false, presets })}
        post={() => {}}
        initialDraft="hello"
      />
    );
    assert.ok(!html.includes('class="preset-list"'));
    assert.ok(html.includes('placeholder="Follow-up (Ctrl+Enter to send · / for presets)"'));
  });
});

suite('webview: Context パネル（M13）', () => {
  test('次に送る内容（プリセットと添付を展開した文）だけを出す。セッションの情報は右サイドバーへ', () => {
    const html = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          presets: [{ name: 'fix', prompt: 'Fix: {input}' }],
          attachments: [{ kind: 'file', path: 'D:\\w\\a.ts' }],
          context: {
            cwd: 'D:\\w',
            permissionMode: 'acceptEdits',
            alwaysAllowed: ['Bash(npm test)'],
          },
        })}
        post={() => {}}
        initialDraft="/fix the bug"
      />
    );
    assert.ok(html.includes('class="context-panel'));
    assert.ok(html.includes('Fix: the bug'));
    assert.ok(html.includes('Attached files:'));
    assert.ok(html.includes('D:\\w\\a.ts'));
    assert.ok(/class="context-brief"[^>]*>1 attached</.test(html), '1 行には添付の数だけ');
    assert.ok(!html.includes('acceptEdits'), '承認方式は右サイドバーへ');
    assert.ok(!html.includes('Bash(npm test)'), '常に許可は右サイドバーへ');
    assert.ok(!html.includes('context-facts'));
    assert.ok(/<button[^>]*class="link show-session"[^>]*>[\s\S]*?Session<\/button>/.test(html));
  });
});

suite('webview: 入力欄と実行中の表示（UI の見直し）', () => {
  test('入力欄の高さは、既定で 4 行分', () => {
    const html = render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />);
    assert.ok(/<textarea[^>]*class="prompt-input"[^>]*rows="4"/.test(html));
  });

  test('入力が空の間は送信を押せず、入力すると押せる', () => {
    const empty = render(
      <App state={state({ status: 'done', turnOpen: false })} post={() => {}} />
    );
    assert.ok(/<button[^>]*class="action send"[^>]*disabled/.test(empty));
    const typed = render(
      <App state={state({ status: 'done', turnOpen: false })} post={() => {}} initialDraft="go" />
    );
    assert.ok(/<button[^>]*class="action send"/.test(typed));
    assert.ok(!/<button[^>]*class="action send"[^>]*disabled/.test(typed));
  });

  test('実行中も入力欄は無効にせず、次の指示を書いておける。ボタンは停止のまま', () => {
    const html = render(
      <App state={state({ status: 'running', turnOpen: true })} post={() => {}} />
    );
    const input = html.slice(html.indexOf('<textarea'), html.indexOf('</textarea>'));
    assert.ok(!input.includes('disabled'));
    assert.ok(
      input.includes(
        'placeholder="Write the next instruction while Claude works (send it after the turn ends)"'
      )
    );
    assert.ok(/class="action stop"[^>]*><i[^>]*codicon-debug-stop[^>]*><\/i>Stop</.test(html));
    assert.ok(!html.includes('class="action send"'));
  });

  test('実行中は「実行中…」の代わりに、区切り行と同じ見た目で「ターン n 実行中 · 経過」を出す', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          turnStartedAt: new Date().toISOString(),
          items: [{ kind: 'prompt', turn: 1, text: 'p' }],
        })}
        post={() => {}}
      />
    );
    assert.ok(/class="checkpoint running"[\s\S]*?Turn 2 running · \d+s/.test(html));
    assert.ok(!html.includes('Running…'));
  });

  test('ファイルのドロップの案内は、入力欄の枠に出す（ドラッグ中だけ見える）', () => {
    const html = render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />);
    const box = html.slice(html.indexOf('class="composer-box"'));
    assert.ok(
      /class="drop-hint"[^>]*>Drop files to attach \(hold Shift when dragging from the editor\)</.test(
        box
      )
    );
  });

  test('「Claude に渡す内容」は閉じていても、添付数を 1 行で出す（ディレクトリと承認方式は右サイドバーへ）', () => {
    const none = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          context: { cwd: 'D:\w\wt', permissionMode: 'default', alwaysAllowed: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(
      /class="context-summary"[\s\S]*?What Claude will receive[\s\S]*?class="context-brief"[^>]*>No attachments</.test(
        none
      )
    );
    const one = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          attachments: [{ kind: 'file', path: 'a.ts' }],
        })}
        post={() => {}}
      />
    );
    assert.ok(one.includes('1 attached'));
  });
});

suite('webview: 見出しの状態（サイドバーと同じ呼び名）', () => {
  test('返答を待つタスクは、承認待ち・質問あり・返答済みを、アイコン付きで出す', () => {
    const replied = render(
      <App state={state({ status: 'waiting', turnOpen: false })} post={() => {}} />
    );
    assert.ok(
      /class="status"[^>]*data-kind="replied"[^>]*><i[^>]*codicon-comment[^>]*><\/i>Replied</.test(
        replied
      )
    );
    const question = render(
      <App
        state={state({
          status: 'waiting',
          turnOpen: true,
          pending: {
            id: 'r',
            toolName: 'AskUserQuestion',
            input: { questions: [{ question: 'q?', options: [] }] },
            suggestions: [],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(
      /class="status"[^>]*data-kind="question"[^>]*><i[^>]*codicon-question[^>]*><\/i>Question</.test(
        question
      )
    );
    const approval = render(
      <App
        state={state({
          status: 'waiting',
          turnOpen: true,
          pending: { id: 'r', toolName: 'Bash', input: { command: 'ls' }, suggestions: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(
      /class="status"[^>]*data-kind="approval"[^>]*>(<i[^>]*><\/i>)Needs approval</.test(approval)
    );
  });
});

suite('webview: Claude Code のコマンドとスキルの補完', () => {
  const presets = [{ name: 'fix', prompt: 'Fix: {input}' }];
  const commands = [
    { name: 'compact', description: 'Clear history but keep a summary', argumentHint: '' },
    { name: 'frontend-design', description: 'Design UI', argumentHint: '<page>' },
    { name: 'commit', description: 'Commit changes', argumentHint: '' },
  ];

  test('/ だけならプリセットだけを出し、コマンドは件数の案内にする', () => {
    const html = render(
      <App
        state={state({ status: 'done', turnOpen: false, presets, commands })}
        post={() => {}}
        initialDraft="/"
      />
    );
    const list = html.slice(html.indexOf('class="preset-list"'), html.indexOf('</ul>'));
    assert.ok(list.includes('/fix'));
    assert.ok(!list.includes('/compact'));
    assert.ok(html.includes('3 more: keep typing to filter'));
  });

  test('文字を打つと絞り込み、名前・引数のヒント・説明を 1 行に並べ、全文は title に入れる', () => {
    const html = render(
      <App
        state={state({ status: 'done', turnOpen: false, presets, commands })}
        post={() => {}}
        initialDraft="/com"
      />
    );
    const list = html.slice(html.indexOf('class="preset-list"'), html.indexOf('</ul>'));
    assert.ok(list.includes('/compact') && list.includes('/commit') && !list.includes('/fix'));
    assert.ok(/<li[^>]*title="Clear history but keep a summary"/.test(list));
    assert.ok(/class="preset-desc"[^>]*>Clear history but keep a summary</.test(list));
    assert.ok(/data-selected="true"[\s\S]*?\/compact/.test(list), '最初の候補が選ばれている');
    assert.ok(
      /class="preset-detail"[^>]*>Clear history but keep a summary</.test(html),
      '選んだ候補の説明を全文で出す'
    );
  });

  test('commands メッセージで一覧が入れ替わる', () => {
    const s = reduce(state({ status: 'done', turnOpen: false }), { type: 'commands', commands });
    assert.deepStrictEqual(s?.commands, commands);
  });
});
