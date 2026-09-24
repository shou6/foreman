import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
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
    models: [{ value: 'claude-opus-5', label: 'claude-opus-5', description: '' }],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: ラフに寄せた表示', () => {
  test('連続するツールの呼び出しは 1 つのグループにまとめ、出力を挟むと分かれる', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            {
              kind: 'tool',
              turn: 0,
              id: '1',
              name: 'Read',
              input: { file_path: 'a.ts' },
              status: 'ok',
            },
            { kind: 'tool', turn: 0, id: '2', name: 'Grep', input: { pattern: 'x' }, status: 'ok' },
            { kind: 'text', turn: 0, text: 'found' },
            {
              kind: 'tool',
              turn: 0,
              id: '3',
              name: 'Edit',
              input: { file_path: 'a.ts' },
              status: 'running',
            },
          ],
        })}
        post={() => {}}
      />
    );
    assert.strictEqual(html.split('class="tool-group').length - 1, 2);
    assert.ok(html.includes('data-status="running"'));
    assert.ok(html.includes('Grep'));
  });

  test('差分カードの見出しに、ファイル数と追加・削除の合計を出す', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: true },
          ],
          changes: {
            0: [
              {
                path: 'src/a.ts',
                kind: 'modified',
                before: 'h',
                after: 'h2',
                source: 'edit-tool',
                reverted: false,
                added: 6,
                removed: 14,
              },
              {
                path: 'src/b.ts',
                kind: 'created',
                after: 'h3',
                source: 'edit-tool',
                reverted: false,
                added: 31,
                removed: 0,
              },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('Changes in turn 1'));
    assert.ok(html.includes('2 files'));
    assert.ok(html.includes('+37'));
    assert.ok(html.includes('−14'));
    // ファイル名とフォルダを分けて出す
    assert.ok(html.includes('>a.ts<'));
    assert.ok(html.includes('src/'));
  });

  test('モデルの選択は入力欄の行にあり、見出しにはモデルを出さない', () => {
    const html = render(
      <App
        state={state({ activeModel: 'claude-haiku-4-5', model: 'claude-sonnet-5' })}
        post={() => {}}
      />
    );
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    assert.ok(!header.includes('<select'));
    assert.ok(!header.includes('haiku'));
    const footer = html.slice(html.indexOf('<footer'));
    assert.ok(footer.includes('<select'));
  });
});

suite('webview: 差分カードの細部', () => {
  test('インライン差分に変更前と変更後の行番号を出す', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: true },
          ],
          changes: {
            0: [
              {
                path: 'a.ts',
                kind: 'modified',
                before: 'h',
                after: 'h2',
                source: 'edit-tool',
                reverted: false,
                added: 1,
                removed: 1,
              },
            ],
          },
          diffs: {
            '0:a.ts': [
              { kind: 'same', text: 'keep' },
              { kind: 'del', text: 'old' },
              { kind: 'add', text: 'new' },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="diff-no"'));
    assert.ok(/data-old="2"/.test(html));
    assert.ok(/data-new="2"/.test(html));
  });

  test('行数は操作ボタンと同じ右側のまとまりに出す', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: true },
          ],
          changes: {
            0: [
              {
                path: 'a.ts',
                kind: 'modified',
                before: 'h',
                after: 'h2',
                source: 'edit-tool',
                reverted: false,
                added: 3,
                removed: 1,
              },
            ],
          },
        })}
        post={() => {}}
      />
    );
    const actions = html.slice(html.indexOf('class="diff-file-actions"'));
    assert.ok(actions.includes('+3'));
    assert.ok(actions.indexOf('+3') < actions.indexOf('Open diff'));
  });

  test('画面の幅の設定を CSS 変数として出す', () => {
    const html = render(<App state={state({ maxWidthEm: 90 })} post={() => {}} />);
    assert.ok(html.includes('--foreman-max-width: 90em'));
    const full = render(<App state={state({ maxWidthEm: 0 })} post={() => {}} />);
    assert.ok(full.includes('--foreman-max-width: none'));
  });
});
