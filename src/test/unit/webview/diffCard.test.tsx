import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';
import { reduce } from '../../../webview/state';
import type { FileChange } from '../../../domain/task';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

const CHANGES: FileChange[] = [
  {
    path: 'src/a.ts',
    kind: 'modified',
    before: 'h1',
    after: 'h2',
    source: 'edit-tool',
    reverted: false,
    added: 3,
    removed: 1,
  },
  {
    path: 'out/c.txt',
    kind: 'modified',
    after: 'h3',
    source: 'watcher',
    reverted: false,
  },
  {
    path: 'README.md',
    kind: 'created',
    after: 'h4',
    source: 'edit-tool',
    reverted: true,
    added: 2,
    removed: 0,
  },
];

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

suite('webview: 差分カード', () => {
  test('changes メッセージでターンごとの変更が状態に入る', () => {
    const s = reduce(state({}), { type: 'changes', turn: 0, changes: CHANGES });
    assert.deepStrictEqual(s?.changes, { 0: CHANGES });
  });

  test('diff メッセージで、ファイルの差分の行が状態に入る', () => {
    const lines = [{ kind: 'add' as const, text: 'x' }];
    const s = reduce(state({}), { type: 'diff', turn: 0, path: 'src/a.ts', lines });
    assert.deepStrictEqual(s?.diffs, { '0:src/a.ts': lines });
  });

  test('ターンの終わりに、変更されたファイルと行数を並べる。行の操作はアイコン', () => {
    const html = render(<App state={state({ changes: { 0: CHANGES } })} post={() => {}} />);
    assert.ok(html.includes('class="diff-card'));
    assert.ok(html.includes('a.ts') && html.includes('src/'));
    assert.ok(html.includes('+3'));
    assert.ok(html.includes('−1'));
    assert.ok(
      /class="icon-button open-diff"[^>]*title="Open diff"[^>]*><i[^>]*codicon-diff[^>]*>/.test(
        html
      )
    );
    assert.ok(
      /class="icon-button revert"[^>]*title="Revert"[^>]*><i[^>]*codicon-discard[^>]*>/.test(html)
    );
  });

  test('見出しはターンの番号。「すべて戻す」は枠のない控えめな操作', () => {
    const html = render(<App state={state({ changes: { 0: CHANGES } })} post={() => {}} />);
    assert.ok(/class="diff-card-title"[^>]*>Changes in turn 1</.test(html));
    assert.ok(/class="revert-all"[^>]*><i[^>]*codicon-discard[^>]*><\/i>Revert all</.test(html));
  });

  test('変更前が不明なファイルは、戻せない理由を警告のアイコン付きで出し、戻すボタンを出さない', () => {
    const html = render(<App state={state({ changes: { 0: [CHANGES[1]!] } })} post={() => {}} />);
    assert.ok(
      /class="unknown"[^>]*><i[^>]*codicon-warning[^>]*><\/i>Changed by the shell \(cannot revert\)/.test(
        html
      )
    );
    assert.ok(!html.includes('class="icon-button revert"'));
  });

  test('戻したファイルは「戻した」と出す', () => {
    const html = render(<App state={state({ changes: { 0: [CHANGES[2]!] } })} post={() => {}} />);
    assert.ok(html.includes('Reverted'));
    assert.ok(html.includes('data-kind="created"'));
  });

  test('差分の行が届いていれば、インラインで出す', () => {
    const html = render(
      <App
        state={state({
          changes: { 0: [CHANGES[0]!] },
          diffs: {
            '0:src/a.ts': [
              { kind: 'same', text: 'keep' },
              { kind: 'del', text: 'old <b>' },
              { kind: 'add', text: 'new' },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="diff-line" data-kind="del"'));
    assert.ok(html.includes('old &lt;b') && !html.includes('<b>'));
    assert.ok(html.includes('class="diff-line" data-kind="add"'));
  });

  test('変更が無いターンにはカードを出さない', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.ok(!html.includes('class="diff-card'));
  });

  test('showDiff、openDiff、revert のメッセージの型がある', () => {
    const messages: ToExtension[] = [
      { type: 'showDiff', turn: 0, path: 'a' },
      { type: 'openDiff', turn: 0, path: 'a' },
      { type: 'revert', turn: 0, path: 'a' },
    ];
    assert.strictEqual(messages.length, 3);
  });
});
