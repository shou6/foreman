import * as assert from 'assert';
import { worktreeName, worktreePath, WORKTREE_DIR } from '../../../domain/worktree';

suite('worktreeName', () => {
  test('タイトルの slug とタスク ID の先頭 6 文字をつなぐ', () => {
    assert.strictEqual(
      worktreeName('Refactor the auth API', '0f3a9c12-aaaa-bbbb-cccc-ddddeeeeffff'),
      'refactor-the-auth-api-0f3a9c'
    );
  });

  test('英数字以外は - にまとめ、長すぎるタイトルは 40 文字で切る', () => {
    assert.strictEqual(
      worktreeName('  Fix: README/CHANGELOG (v2)!!  ', 'abcdef0123'),
      'fix-readme-changelog-v2-abcdef'
    );
    const long = worktreeName('a'.repeat(80), 'abcdef0123');
    assert.strictEqual(long, 'a'.repeat(40) + '-abcdef');
  });

  test('日本語だけのタイトルは task にする', () => {
    assert.strictEqual(worktreeName('認証 API のリファクタ', 'abcdef0123'), 'task-abcdef');
  });
});

suite('worktreePath', () => {
  test('リポジトリ内の .foreman/worktrees/<名前>', () => {
    assert.strictEqual(WORKTREE_DIR, '.foreman/worktrees');
    assert.strictEqual(
      worktreePath('D:\\work\\repo', 'task-abcdef', '\\'),
      'D:\\work\\repo\\.foreman\\worktrees\\task-abcdef'
    );
    assert.strictEqual(
      worktreePath('/home/me/repo', 'task-abcdef', '/'),
      '/home/me/repo/.foreman/worktrees/task-abcdef'
    );
  });
});
