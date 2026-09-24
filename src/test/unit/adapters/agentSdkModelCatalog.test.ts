import * as assert from 'assert';
import { AgentSdkModelCatalog, type ModelQueryFn } from '../../../adapters/agentSdkModelCatalog';

suite('AgentSdkModelCatalog', () => {
  test('指示を送らずに claude を起動し、supportedModels の結果を返して、プロセスを閉じる', async () => {
    const calls: { options: Record<string, unknown> }[] = [];
    let closed = false;
    let prompted = false;
    const query: ModelQueryFn = (params) => {
      calls.push({ options: params.options as Record<string, unknown> });
      // 指示の入力は最後まで読まれないこと（何も送らない）
      void (async () => {
        for await (const _ of params.prompt) {
          prompted = true;
        }
      })();
      return {
        supportedModels: async () => [
          {
            value: 'sonnet',
            resolvedModel: 'claude-sonnet-5',
            displayName: 'Sonnet',
            description: 'd',
            supportedEffortLevels: ['low', 'high'],
          },
        ],
        close: () => {
          closed = true;
        },
      } as never;
    };
    const catalog = new AgentSdkModelCatalog({
      query,
      claudePath: () => 'C:\\claude.exe',
      cwd: () => 'D:\\w',
    });
    const models = await catalog.list();
    assert.deepStrictEqual(models, [
      {
        value: 'sonnet',
        resolvedModel: 'claude-sonnet-5',
        displayName: 'Sonnet',
        description: 'd',
        supportedEffortLevels: ['low', 'high'],
      },
    ]);
    assert.strictEqual(calls[0]?.options.pathToClaudeCodeExecutable, 'C:\\claude.exe');
    assert.strictEqual(calls[0]?.options.cwd, 'D:\\w');
    assert.strictEqual(closed, true);
    assert.strictEqual(prompted, false);
  });

  test('失敗してもプロセスは閉じ、例外を伝える', async () => {
    let closed = false;
    const query: ModelQueryFn = () =>
      ({
        supportedModels: async () => {
          throw new Error('boom');
        },
        close: () => {
          closed = true;
        },
      }) as never;
    const catalog = new AgentSdkModelCatalog({ query, claudePath: () => 'c', cwd: () => 'd' });
    await assert.rejects(catalog.list(), /boom/);
    assert.strictEqual(closed, true);
  });

  test('claude が見つからなければ起動せずに例外', async () => {
    let started = false;
    const query: ModelQueryFn = () => {
      started = true;
      return {} as never;
    };
    const catalog = new AgentSdkModelCatalog({
      query,
      claudePath: () => {
        throw new Error('Claude Code CLI was not found');
      },
      cwd: () => 'd',
    });
    await assert.rejects(catalog.list(), /not found/);
    assert.strictEqual(started, false);
  });
});
