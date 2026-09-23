import * as assert from 'assert';
import { reduce } from '../../../webview/state';
import type { PanelState } from '../../../webview/protocol';

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
  openDiff: 'Open in diff editor',
  revert: 'Revert',
  reverted: 'Reverted',
  unknownBefore: 'Previous content unknown',
};

const initial: PanelState = {
  taskId: 'task-1',
  title: 'README',
  status: 'running',
  items: [],
  changes: {},
  diffs: {},
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
      title: 'New title',
      model: 'claude-sonnet-5',
    });
    assert.strictEqual(state?.status, 'done');
    assert.strictEqual(state?.title, 'New title');
    assert.strictEqual(state?.model, 'claude-sonnet-5');
    assert.deepStrictEqual(state?.items, []);
  });
});
