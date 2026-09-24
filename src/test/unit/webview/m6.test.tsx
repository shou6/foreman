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
    status: 'done',
    turnOpen: false,
    mergeable: false,
    items: [],
    changes: {},
    diffs: {},
    attachments: [],
    models: ['claude-opus-5', 'claude-sonnet-5'],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 添付とモデル', () => {
  test('attachments メッセージで添付の一覧が入れ替わる', () => {
    const s = reduce(state({}), {
      type: 'attachments',
      attachments: [{ kind: 'file', path: 'a.ts' }],
    });
    assert.deepStrictEqual(s?.attachments, [{ kind: 'file', path: 'a.ts' }]);
  });

  test('添付があれば入力欄の上にチップとして出す', () => {
    const html = render(
      <App
        state={state({ attachments: [{ kind: 'file', path: 'D:\\w\\a.ts' }] })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="attachment'));
    assert.ok(html.includes('a.ts'));
    assert.ok(html.includes('Remove'));
  });

  test('モデルの選択肢と、既定を選ぶ項目を出す。指定中のモデルが選ばれている', () => {
    const html = render(<App state={state({ model: 'claude-sonnet-5' })} post={() => {}} />);
    assert.ok(html.includes('<select'));
    assert.ok(html.includes('Default'));
    assert.ok(/<option[^>]*value="claude-sonnet-5"[^>]*selected/.test(html));
    assert.ok(html.includes('claude-opus-5'));
  });

  test('一覧に無いモデルが指定されていても選択肢に出す', () => {
    const html = render(<App state={state({ model: 'claude-custom' })} post={() => {}} />);
    assert.ok(/<option[^>]*value="claude-custom"[^>]*selected/.test(html));
  });

  test('前のターンで動いたモデルが次のモデルと違えば、入力欄に「前のターン」として小さく出す', () => {
    const differs = render(
      <App
        state={state({ model: 'claude-sonnet-5', activeModel: 'claude-haiku-4-5' })}
        post={() => {}}
      />
    );
    const footer = differs.slice(differs.indexOf('<footer'));
    assert.ok(/class="previous-model"[^>]*>Previous turn: haiku-4-5</.test(footer));
    const same = render(
      <App
        state={state({ model: 'claude-sonnet-5', activeModel: 'claude-sonnet-5' })}
        post={() => {}}
      />
    );
    assert.ok(!same.includes('class="previous-model"'));
    const unknown = render(
      <App state={state({ model: undefined, activeModel: 'claude-opus-5[1m]' })} post={() => {}} />
    );
    assert.ok(unknown.includes('Previous turn: opus-5[1m]'));
  });

  test('setModel、dropped、添付つきの send の型がある', () => {
    const messages: ToExtension[] = [
      { type: 'setModel', model: 'claude-opus-5' },
      { type: 'setModel', model: undefined },
      { type: 'dropped', uris: ['file:///d%3A/w/a.ts'] },
      { type: 'send', prompt: 'p', attachments: [{ kind: 'file', path: 'D:\\w\\a.ts' }] },
      { type: 'removeAttachment', key: 'file:D:\\w\\a.ts' },
    ];
    assert.strictEqual(messages.length, 5);
  });
});

suite('webview: 状態の表示名', () => {
  test('状態のバッジは翻訳した表示名を出す', () => {
    const html = render(<App state={state({ status: 'done' })} post={() => {}} />);
    assert.ok(html.includes('>Done<'));
    assert.ok(!html.includes('>done<'));
  });
});
