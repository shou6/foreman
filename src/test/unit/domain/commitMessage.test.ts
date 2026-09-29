import * as assert from 'assert';
import {
  cleanCommitMessage,
  commitMessagePrompt,
  defaultCommitMessage,
} from '../../../domain/commitMessage';

suite('commitMessage', () => {
  test('既定のメッセージは Conventional Commits の chore とタスクのタイトル', () => {
    assert.strictEqual(defaultCommitMessage('有力馬データ更新'), 'chore: 有力馬データ更新');
  });

  test('問い合わせには、プロジェクトの規約を優先すること、無ければ Conventional Commits、タイトルと差分を入れる', () => {
    const prompt = commitMessagePrompt('有力馬データ更新', 'diff --git a/x b/x\n+1');
    assert.ok(prompt.includes('commit message convention'));
    assert.ok(prompt.includes('Conventional Commits'));
    assert.ok(prompt.includes('<type>(<scope>): <summary>'));
    assert.ok(prompt.includes('same language as the task title'));
    assert.ok(prompt.includes('有力馬データ更新'));
    assert.ok(prompt.includes('diff --git a/x b/x\n+1'));
  });

  test('差分が長ければ切り詰め、切ったことを書く', () => {
    const prompt = commitMessagePrompt('t', 'x'.repeat(100_000));
    assert.ok(prompt.length < 40_000);
    assert.ok(prompt.includes('(truncated)'));
  });

  test('返事の前後の空白とコードフェンスを外す。空なら undefined', () => {
    assert.strictEqual(
      cleanCommitMessage('```text\nfeat(db): 集計を追加\n\n本文\n```\n'),
      'feat(db): 集計を追加\n\n本文'
    );
    assert.strictEqual(cleanCommitMessage('  fix: 修正\n'), 'fix: 修正');
    assert.strictEqual(cleanCommitMessage(' \n'), undefined);
    assert.strictEqual(cleanCommitMessage('```\n```'), undefined);
  });
});
