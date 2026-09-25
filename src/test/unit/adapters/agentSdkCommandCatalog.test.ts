import * as assert from 'assert';
import {
  AgentSdkCommandCatalog,
  type CommandQueryFn,
} from '../../../adapters/agentSdkCommandCatalog';

suite('AgentSdkCommandCatalog', () => {
  test('作業フォルダで claude を起動し（ユーザーとプロジェクトのコマンドを読むため設定は読む）、一覧を返して閉じる', async () => {
    const calls: Record<string, unknown>[] = [];
    let closed = false;
    const query: CommandQueryFn = (params) => {
      calls.push(params.options as Record<string, unknown>);
      return {
        supportedCommands: async () => [
          { name: 'compact', description: 'd', argumentHint: '', builtin: true },
          { name: 'my-cmd', description: 'mine', argumentHint: '<x>' },
        ],
        close: () => {
          closed = true;
        },
      } as never;
    };
    const catalog = new AgentSdkCommandCatalog({ query, claudePath: () => 'c' });
    assert.deepStrictEqual(await catalog.list('D:\\w'), [
      { name: 'compact', description: 'd', argumentHint: '' },
      { name: 'my-cmd', description: 'mine', argumentHint: '<x>' },
    ]);
    assert.strictEqual(calls[0]?.cwd, 'D:\\w');
    assert.strictEqual(calls[0]?.pathToClaudeCodeExecutable, 'c');
    assert.strictEqual(
      calls[0]?.settingSources,
      undefined,
      '設定を読まないと自作のコマンドが出ない'
    );
    assert.strictEqual(closed, true);
  });
});
