import * as assert from 'assert';
import {
  cleanTitle,
  suggestTitleWithSdk,
  type TitleQueryFn,
} from '../../../adapters/agentSdkTitler';

suite('cleanTitle', () => {
  test('最初の行だけを使い、引用符や句点を外し、長ければ切る', () => {
    assert.strictEqual(cleanTitle('"README に節を追加"\n補足'), 'README に節を追加');
    assert.strictEqual(cleanTitle('「認証のリファクタ。」'), '認証のリファクタ');
    assert.strictEqual(cleanTitle('Title: Add a test'), 'Add a test');
    assert.strictEqual(cleanTitle('a'.repeat(50)), 'a'.repeat(40) + '…');
    assert.strictEqual(cleanTitle('   '), undefined);
  });
});

suite('suggestTitleWithSdk', () => {
  test('Haiku に 1 回だけ問い合わせ、結果の本文をタイトルにする', async () => {
    const calls: { prompt: string; options: Record<string, unknown> }[] = [];
    const query: TitleQueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options as Record<string, unknown> });
      return (async function* () {
        yield { type: 'result', subtype: 'success', result: 'テストの追加\n' };
      })() as never;
    };
    const title = await suggestTitleWithSdk(query, {
      prompt: 'scripts/generate-icon.js のテストを作成して',
      model: 'claude-haiku-4-5',
      claudePath: 'C:\\claude.exe',
      cwd: 'D:\\w',
    });
    assert.strictEqual(title, 'テストの追加');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0]?.prompt.includes('scripts/generate-icon.js のテストを作成して'));
    assert.strictEqual(calls[0]?.options.model, 'claude-haiku-4-5');
    assert.deepStrictEqual(calls[0]?.options.tools, []);
    assert.deepStrictEqual(calls[0]?.options.settingSources, []);
    assert.strictEqual(calls[0]?.options.pathToClaudeCodeExecutable, 'C:\\claude.exe');
  });

  test('失敗や空の結果は undefined', async () => {
    const empty: TitleQueryFn = () =>
      (async function* () {
        yield { type: 'result', subtype: 'error_during_execution' };
      })() as never;
    assert.strictEqual(
      await suggestTitleWithSdk(empty, { prompt: 'p', model: 'm', claudePath: 'c', cwd: 'd' }),
      undefined
    );
    // 未ログインの claude は success・is_error で案内の文を返す。それをタスク名にしない
    const notLoggedIn: TitleQueryFn = () =>
      (async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: 'Not logged in · Please run /login',
        };
      })() as never;
    assert.strictEqual(
      await suggestTitleWithSdk(notLoggedIn, {
        prompt: 'p',
        model: 'm',
        claudePath: 'c',
        cwd: 'd',
      }),
      undefined
    );
    const throwing: TitleQueryFn = () => {
      throw new Error('no claude');
    };
    assert.strictEqual(
      await suggestTitleWithSdk(throwing, { prompt: 'p', model: 'm', claudePath: 'c', cwd: 'd' }),
      undefined
    );
  });
});
