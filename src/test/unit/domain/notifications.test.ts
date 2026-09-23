import * as assert from 'assert';
import { notificationFor } from '../../../domain/notifications';

suite('notificationFor', () => {
  test('入力待ちになった時と、完了・失敗した時に通知する', () => {
    assert.strictEqual(notificationFor('running', 'waiting', 'all'), 'waiting');
    assert.strictEqual(notificationFor('running', 'done', 'all'), 'done');
    assert.strictEqual(notificationFor('running', 'failed', 'all'), 'failed');
    assert.strictEqual(notificationFor('waiting', 'failed', 'all'), 'failed');
  });

  test('状態が変わらない時や、実行中・中断への変化は通知しない', () => {
    assert.strictEqual(notificationFor('waiting', 'waiting', 'all'), undefined);
    assert.strictEqual(notificationFor('waiting', 'running', 'all'), undefined);
    assert.strictEqual(notificationFor('running', 'interrupted', 'all'), undefined);
    assert.strictEqual(notificationFor(undefined, 'running', 'all'), undefined);
  });

  test('設定 waiting は入力待ちだけ、none は何も通知しない', () => {
    assert.strictEqual(notificationFor('running', 'waiting', 'waiting'), 'waiting');
    assert.strictEqual(notificationFor('running', 'done', 'waiting'), undefined);
    assert.strictEqual(notificationFor('running', 'failed', 'waiting'), undefined);
    assert.strictEqual(notificationFor('running', 'waiting', 'none'), undefined);
  });
});

suite('notificationFor: レビュー待ち（M10）', () => {
  test('レビュー待ちになった時は、完了と同じく all の時だけ通知する', () => {
    assert.strictEqual(notificationFor('running', 'review', 'all'), 'review');
    assert.strictEqual(notificationFor('done', 'review', 'all'), 'review');
    assert.strictEqual(notificationFor('running', 'review', 'waiting'), undefined);
    assert.strictEqual(
      notificationFor('review', 'done', 'all'),
      undefined,
      '承認は自分の操作なので通知しない'
    );
  });
});
