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
      { kind: 'turn-end', turn: 0, ok: true },
      { kind: 'prompt', turn: 1, text: 'q' },
      { kind: 'turn-end', turn: 1, ok: true },
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

suite('webview: チェックポイント', () => {
  test('正常に終わったターンごとに、番号と、ホバーで出す「戻す」「切り出す」を出す', () => {
    const html = render(<App state={state({})} post={() => {}} />);
    assert.strictEqual(html.split('class="checkpoint"').length - 1, 2);
    assert.ok(html.includes('Turn 1'));
    assert.ok(html.includes('Turn 2'));
    assert.ok(
      /class="checkpoint-actions"[\s\S]*?class="checkpoint-action rewind"[^>]*title="Rewind to here"[^>]*><i[^>]*codicon-discard[^>]*><\/i>Rewind</.test(
        html
      )
    );
    assert.ok(
      /class="checkpoint-action fork"[^>]*title="Fork from here"[^>]*><i[^>]*codicon-git-branch[^>]*><\/i>Fork</.test(
        html
      )
    );
  });

  test('失敗や中断で終わったターンには出さない', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: false, interrupted: true, reason: 'stopped' },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(!html.includes('class="checkpoint"'));
  });

  test('実行中は押せない', () => {
    const html = render(
      <App state={state({ status: 'running', turnOpen: true })} post={() => {}} />
    );
    assert.ok(/<button[^>]*class="checkpoint-action rewind"[^>]*disabled/.test(html));
  });

  test('rewind と fork のメッセージの型がある', () => {
    const messages: ToExtension[] = [
      { type: 'rewind', turn: 0 },
      { type: 'fork', turn: 1 },
    ];
    assert.strictEqual(messages.length, 2);
  });
});

suite('webview: 承認（レビュー待ち）', () => {
  const changes = {
    1: [
      { path: 'a.txt', kind: 'modified' as const, source: 'edit-tool' as const, reverted: false },
    ],
  };

  test('レビュー待ちの最後のターンの差分カードに「すべて戻す」と「承認して完了」を出す。ヘッダーには出さない', () => {
    const review = render(<App state={state({ status: 'review', changes })} post={() => {}} />);
    assert.ok(/class="diff-card"[\s\S]*class="revert-all"/.test(review));
    assert.ok(
      /class="diff-card"[\s\S]*class="approve primary"[^>]*>Approve and finish</.test(review)
    );
    assert.ok(!review.includes('class="head-action approve"'));
    const done = render(<App state={state({ status: 'done', changes })} post={() => {}} />);
    assert.ok(!done.includes('class="approve primary"'));
    assert.ok(done.includes('class="revert-all"'), 'すべて戻すは完了後も使える');
  });

  test('返答を待っているタスク（ターン終了後の入力待ち）は、ヘッダーに「完了にする」を出す', () => {
    const html = render(
      <App state={state({ status: 'waiting', turnOpen: false })} post={() => {}} />
    );
    assert.ok(/class="head-action approve"[^>]*>Mark as done</.test(html));
  });

  test('完了したタスクの最後の差分カードには「承認済み」の印と、取り消せる時は「取り消す」を出す', () => {
    const undoable = render(
      <App state={state({ status: 'done', changes, unapprovable: true })} post={() => {}} />
    );
    assert.ok(/class="approved-mark"[^>]*><i[^>]*codicon-pass[^>]*><\/i>Approved</.test(undoable));
    assert.ok(/class="unapprove"[^>]*>Undo approval</.test(undoable));
    const merged = render(
      <App state={state({ status: 'done', changes, unapprovable: false })} post={() => {}} />
    );
    assert.ok(merged.includes('class="approved-mark"'));
    assert.ok(!merged.includes('class="unapprove"'));
    const review = render(<App state={state({ status: 'review', changes })} post={() => {}} />);
    assert.ok(!review.includes('class="approved-mark"'));
  });

  test('unapprove のメッセージの型がある', () => {
    const message: ToExtension = { type: 'unapprove' };
    assert.strictEqual(message.type, 'unapprove');
  });

  test('「すべて戻す」は最後に変更のあったターンのカードにだけ出す（それ以降のターンも戻すため）', () => {
    const two = {
      0: [
        { path: 'a.txt', kind: 'modified' as const, source: 'edit-tool' as const, reverted: false },
      ],
      1: [
        { path: 'b.txt', kind: 'modified' as const, source: 'edit-tool' as const, reverted: false },
      ],
    };
    const html = render(<App state={state({ status: 'done', changes: two })} post={() => {}} />);
    const first = html.slice(html.indexOf('Changes in turn 1'), html.indexOf('Changes in turn 2'));
    const second = html.slice(html.indexOf('Changes in turn 2'));
    assert.ok(!first.includes('class="revert-all"'));
    assert.ok(second.includes('class="revert-all"'));
  });

  test('approve と revertAll のメッセージの型がある', () => {
    const messages: ToExtension[] = [{ type: 'approve' }, { type: 'revertAll', turn: 1 }];
    assert.strictEqual(messages.length, 2);
  });
});

suite('webview: コンテキストのメーター（M11）', () => {
  test('使用量があれば見出しの 2 行目にメーターと「84k / 200k (42%)」を出す', () => {
    const html = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          usage: { used: 84000, window: 200000, ratio: 0.42 },
        })}
        post={() => {}}
      />
    );
    assert.ok(/class="head-meta"[\s\S]*class="meter"[^>]*title="[^"]*42%/.test(html));
    assert.ok(html.includes('84k / 200k (42%)'));
    assert.ok(/class="meter-fill"[^>]*style="width: 42%/.test(html));
  });

  test('使用量が無ければメーターを出さない', () => {
    const html = render(<App state={state({ status: 'done', turnOpen: false })} post={() => {}} />);
    assert.ok(!html.includes('class="meter"'));
  });

  test('ターンの区切りにトークン数を出す', () => {
    const html = render(
      <App
        state={state({
          status: 'done',
          turnOpen: false,
          tokens: { 1: { input: 84000, output: 500 } },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('84k'));
    assert.ok(html.includes('500'));
    assert.ok(/class="checkpoint"[\s\S]*class="turn-tokens"/.test(html));
  });
});
