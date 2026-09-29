import * as assert from 'assert';
import { writeCommitMessageWithSdk } from '../../../adapters/agentSdkCommitMessage';
import type { TitleQueryFn } from '../../../adapters/agentSdkTitler';

suite('writeCommitMessageWithSdk', () => {
  test('プロジェクトの CLAUDE.md とルールを読ませて 1 回だけ問い合わせ、返事をメッセージにする', async () => {
    const calls: { prompt: string; options: Record<string, unknown> }[] = [];
    const query: TitleQueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options as Record<string, unknown> });
      return (async function* () {
        yield { type: 'result', subtype: 'success', result: '```\nfeat(db): 集計を追加\n```' };
      })() as never;
    };
    const message = await writeCommitMessageWithSdk(query, {
      title: '集計の追加',
      diff: 'diff --git a/x b/x',
      model: 'haiku',
      claudePath: 'C:\claude.exe',
      cwd: 'D:\repo',
    });
    assert.strictEqual(message, 'feat(db): 集計を追加');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0]?.prompt.includes('diff --git a/x b/x'));
    assert.strictEqual(calls[0]?.options.cwd, 'D:\repo');
    assert.strictEqual(calls[0]?.options.model, 'haiku');
    assert.deepStrictEqual(calls[0]?.options.tools, []);
    assert.deepStrictEqual(calls[0]?.options.settingSources, ['project', 'local']);
    assert.strictEqual(calls[0]?.options.pathToClaudeCodeExecutable, 'C:\claude.exe');
  });

  test('失敗、未ログイン、例外は undefined', async () => {
    const request = { title: 't', diff: 'd', model: 'm', claudePath: 'c', cwd: 'r' };
    const failed: TitleQueryFn = () =>
      (async function* () {
        yield { type: 'result', subtype: 'error_during_execution' };
      })() as never;
    assert.strictEqual(await writeCommitMessageWithSdk(failed, request), undefined);
    const notLoggedIn: TitleQueryFn = () =>
      (async function* () {
        yield { type: 'result', subtype: 'success', is_error: true, result: 'Not logged in' };
      })() as never;
    assert.strictEqual(await writeCommitMessageWithSdk(notLoggedIn, request), undefined);
    const throws: TitleQueryFn = () => {
      throw new Error('spawn failed');
    };
    assert.strictEqual(await writeCommitMessageWithSdk(throws, request), undefined);
  });
});
