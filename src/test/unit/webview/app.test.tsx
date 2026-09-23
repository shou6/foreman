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
  pass: 'Pass along',
  selection: 'Selection',
  diagnostics: 'Diagnostics',
  gitDiff: 'git diff',
  addFile: '+ File',
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
  test('選択範囲・診断・git diff・ファイルのボタンを出す', () => {
    const html = render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />);
    assert.ok(html.includes('class="pass-label"'));
    assert.ok(html.includes('class="pass selection"'));
    assert.ok(html.includes('class="pass diagnostics"'));
    assert.ok(html.includes('class="pass git-diff"'));
    assert.ok(html.includes('class="pass pick-files"'));
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

  test('入力が / で始まらなければ候補を出さない。入力欄の案内にプリセットの名前が入る', () => {
    const html = render(
      <App
        state={state({ status: 'done', turnOpen: false, presets })}
        post={() => {}}
        initialDraft="hello"
      />
    );
    assert.ok(!html.includes('class="preset-list"'));
    assert.ok(html.includes('/fix /test'));
  });
});

suite('webview: Context パネル（M13）', () => {
  test('次に送る内容（プリセットと添付を展開した文）と、セッションの情報を出す', () => {
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
    assert.ok(html.includes('acceptEdits'));
    assert.ok(html.includes('Bash(npm test)'));
  });
});
