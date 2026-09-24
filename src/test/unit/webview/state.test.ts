import * as assert from 'assert';
import { reduce } from '../../../webview/state';
import type { PanelState } from '../../../webview/protocol';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

const initial: PanelState = {
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
};

suite('webview reduce', () => {
  test('state で全体を置き換える', () => {
    assert.deepStrictEqual(reduce(undefined, { type: 'state', state: initial }), initial);
  });

  test('state が届く前のイベントは無視する', () => {
    assert.strictEqual(reduce(undefined, { type: 'turn-start', turn: 0, prompt: 'p' }), undefined);
  });

  test('turn-start と event で履歴が伸びる', () => {
    let state = reduce(initial, { type: 'turn-start', turn: 0, prompt: 'p' });
    state = reduce(state, { type: 'event', turn: 0, event: { type: 'text', text: 'hi' } });
    assert.deepStrictEqual(state?.items, [
      { kind: 'prompt', turn: 0, text: 'p' },
      { kind: 'text', turn: 0, text: 'hi' },
    ]);
  });

  test('task で状態とタイトルとモデルが変わる', () => {
    const state = reduce(initial, {
      type: 'task',
      status: 'done',
      turnOpen: false,
      mergeable: false,
      title: 'New title',
      model: 'claude-sonnet-5',
    });
    assert.strictEqual(state?.status, 'done');
    assert.strictEqual(state?.title, 'New title');
    assert.strictEqual(state?.model, 'claude-sonnet-5');
    assert.deepStrictEqual(state?.items, []);
  });
});

suite('reduce: truncate', () => {
  test('指定のターンより後の履歴、変更、差分を消す', () => {
    const base = reduce(undefined, {
      type: 'state',
      state: {
        taskId: 't',
        title: 'T',
        status: 'done',
        turnOpen: false,
        mergeable: false,
        items: [
          { kind: 'prompt', turn: 0, text: 'a' },
          { kind: 'turn-end', turn: 0, ok: true },
          { kind: 'prompt', turn: 1, text: 'b' },
          { kind: 'turn-end', turn: 1, ok: true },
        ],
        changes: {
          0: [{ path: 'x', kind: 'modified', source: 'watcher', reverted: false }],
          1: [{ path: 'y', kind: 'modified', source: 'watcher', reverted: false }],
        },
        diffs: { '0:x': [], '1:y': [] },
        attachments: [],
        models: [],
        maxWidthEm: 72,
        toolCallsExpanded: false,
        presets: [],
        context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
        strings: STRINGS,
      },
    });
    const next = reduce(base, { type: 'truncate', afterTurn: 0 });
    assert.deepStrictEqual(next?.items, [
      { kind: 'prompt', turn: 0, text: 'a' },
      { kind: 'turn-end', turn: 0, ok: true },
    ]);
    assert.deepStrictEqual(Object.keys(next?.changes ?? {}), ['0']);
    assert.deepStrictEqual(Object.keys(next?.diffs ?? {}), ['0:x']);
  });
});
