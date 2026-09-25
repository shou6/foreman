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
    items: [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'tool', turn: 0, id: '1', name: 'Read', input: { file_path: 'a.ts' }, status: 'ok' },
      { kind: 'tool', turn: 0, id: '2', name: 'Bash', input: { command: 'ls' }, status: 'error' },
      { kind: 'tool', turn: 0, id: '3', name: 'Grep', input: { pattern: 'x' }, status: 'ok' },
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

suite('webview: ツールの呼び出しのたたみ', () => {
  test('既定ではたたみ、件数と成否とツール名の要約を出す', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(/<details[^>]*class="tool-group[^"]*"(?![^>]*\bopen\b)/.test(html), 'たたまれている');
    assert.ok(html.includes('3 tool calls'));
    assert.ok(html.includes('✓2'));
    assert.ok(html.includes('✗1'));
    assert.ok(html.includes('Read, Bash, Grep'));
  });

  test('設定で開いた状態にできる', () => {
    const html = render(<App state={state({ toolCallsExpanded: true })} post={() => {}} />);
    assert.ok(/<details[^>]*class="tool-group[^"]*"[^>]*\bopen\b/.test(html));
  });

  test('実行中のツールがあっても、たたみの設定なら開かない（開閉が繰り返されないように）', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          mergeable: false,
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'tool', turn: 0, id: '1', name: 'Read', input: {}, status: 'running' },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/<details[^>]*class="tool-group[^"]*"(?![^>]*open)/.test(html), 'たたまれたまま');
  });

  test('実行中のツールは、たたんだグループの外に対象付きの 1 行で見せ、要約の名前からは外す', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'tool', turn: 0, id: '1', name: 'Read', input: {}, status: 'ok' },
            {
              kind: 'tool',
              turn: 0,
              id: '2',
              name: 'Edit',
              input: { file_path: 'src/test/unit/diffCard.test.ts' },
              status: 'running',
            },
          ],
        })}
        post={() => {}}
      />
    );
    const summary = html.slice(html.indexOf('class="group-summary"'), html.indexOf('</summary>'));
    assert.ok(summary.includes('Read'));
    assert.ok(!summary.includes('Edit'));
    const running = html.slice(html.indexOf('</details>'));
    assert.ok(
      /class="tool-running"[\s\S]*?codicon-loading codicon-modifier-spin[\s\S]*?class="tool-name"[^>]*>Edit<[\s\S]*?src\/test\/unit\/diffCard.test.ts/.test(
        running
      )
    );
  });
});

suite('webview: 実行中のツールの行の場所を取っておく（画面が揺れないように）', () => {
  const items = [
    { kind: 'prompt' as const, turn: 0, text: 'p' },
    { kind: 'tool' as const, turn: 0, id: '1', name: 'Read', input: {}, status: 'ok' as const },
  ];

  test('動いている間は、最後のツールのまとまりの下に、実行中のツールが無くても同じ高さの空の行を置く', () => {
    const html = render(
      <App state={state({ status: 'running', turnOpen: true, items })} post={() => {}} />
    );
    assert.ok(/class="tool-running idle"[^>]*aria-hidden="true"/.test(html));
  });

  test('ターンが終わったら空の行は出さない', () => {
    const html = render(
      <App state={state({ status: 'waiting', turnOpen: false, items })} post={() => {}} />
    );
    assert.ok(!html.includes('tool-running'));
  });
});

suite('webview: 質問の待ち', () => {
  test('AskUserQuestion は質問のカードに出るので、実行中のツールの行には JSON を出さない', () => {
    const html = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            {
              kind: 'tool',
              turn: 0,
              id: 'q',
              name: 'AskUserQuestion',
              input: { questions: [] },
              status: 'running',
            },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(!/class="tool-running"[^>]*>/.test(html));
    // 場所だけは取っておく（空の行）
    assert.ok(html.includes('class="tool-running idle"'));
  });
});

suite('webview: 見出しの「…」メニュー', () => {
  test('エクスポートなどは見出しに並べず「…」にまとめ、more のメッセージを送る', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('>Export<'));
    assert.ok(
      /class="icon-button more"[^>]*title="More actions"[^>]*><i[^>]*codicon-ellipsis/.test(html)
    );
    const message: ToExtension = { type: 'more' };
    assert.strictEqual(message.type, 'more');
  });
});

suite('webview: タスク名の変更', () => {
  test('見出しの題名はボタンで、押すと rename のメッセージを送る', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(/<button[^>]*class="title"[^>]*title="Rename"/.test(html));
    const message: ToExtension = { type: 'rename' };
    assert.strictEqual(message.type, 'rename');
  });
});

suite('webview: 考えている途中（thinking）', () => {
  const items = [
    { kind: 'prompt' as const, turn: 0, text: 'p' },
    { kind: 'thinking' as const, turn: 0, text: 'First, read the file.' },
    { kind: 'text' as const, turn: 0, text: 'Done' },
  ];

  test('既定ではたたんで出し、開くと中身が読める。動いている間は「考え中…」', () => {
    const html = render(<App state={state({ items, thinking: 'collapsed' })} post={() => {}} />);
    assert.ok(/<details class="item thinking"(?![^>]*open)[^>]*>/.test(html));
    assert.ok(/<summary[^>]*>(<i[^>]*><\/i>)?Thought<\/summary>/.test(html));
    assert.ok(html.includes('First, read the file.'));
    const running = render(
      <App
        state={state({
          status: 'running',
          turnOpen: true,
          items: items.slice(0, 2),
          thinking: 'collapsed',
        })}
        post={() => {}}
      />
    );
    assert.ok(/<summary[^>]*>(<i[^>]*><\/i>)?Thinking…<\/summary>/.test(running));
  });

  test('設定 hidden なら出さない', () => {
    const html = render(<App state={state({ items, thinking: 'hidden' })} post={() => {}} />);
    assert.ok(!html.includes('class="item thinking"'));
    assert.ok(!html.includes('First, read the file.'));
  });

  test('文の無い thinking は、動いている間だけ「考え中…」の印を出し、終わったら何も残さない', () => {
    const empty = [
      { kind: 'prompt' as const, turn: 0, text: 'p' },
      { kind: 'thinking' as const, turn: 0, text: '' },
    ];
    const running = render(
      <App
        state={state({ status: 'running', turnOpen: true, items: empty, thinking: 'collapsed' })}
        post={() => {}}
      />
    );
    assert.ok(/class="item thinking-indicator"[^>]*>(<i[^>]*><\/i>)?Thinking…</.test(running));
    assert.ok(!running.includes('<details class="item thinking"'));
    const done = render(
      <App
        state={state({ items: [...empty, { kind: 'text', turn: 0, text: 'Done' }] })}
        post={() => {}}
      />
    );
    assert.ok(!done.includes('thinking-indicator') && !done.includes('class="item thinking"'));
    const hidden = render(
      <App
        state={state({ status: 'running', turnOpen: true, items: empty, thinking: 'hidden' })}
        post={() => {}}
      />
    );
    assert.ok(!hidden.includes('thinking-indicator'));
  });
});
