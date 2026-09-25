import * as assert from 'assert';
import { CommandService } from '../../../app/commandService';
import type { CommandCatalog } from '../../../ports/commandCatalog';

const COMPACT = { name: 'compact', description: 'd', argumentHint: '' };

function catalog(result: () => Promise<unknown>): CommandCatalog & { calls: string[] } {
  const c = {
    calls: [] as string[],
    list: async (cwd: string) => {
      c.calls.push(cwd);
      return (await result()) as never;
    },
  };
  return c;
}

suite('CommandService', () => {
  test('取得する前は空。取得すると一覧が入り、変わったことを知らせる', async () => {
    const service = new CommandService(catalog(async () => [COMPACT]));
    assert.deepStrictEqual(service.current(), []);
    let changed = 0;
    service.onDidChange(() => changed++);
    await service.load('D:\\w');
    assert.deepStrictEqual(service.current(), [COMPACT]);
    assert.strictEqual(changed, 1);
  });

  test('取得は 1 回だけ。作業フォルダを渡す', async () => {
    const c = catalog(async () => [COMPACT]);
    const service = new CommandService(c);
    await Promise.all([service.load('D:\\w'), service.load('D:\\w')]);
    assert.deepStrictEqual(c.calls, ['D:\\w']);
  });

  test('取得に失敗しても空のまま。失敗は知らせるだけで例外にしない', async () => {
    const errors: unknown[] = [];
    const service = new CommandService(
      catalog(async () => {
        throw new Error('boom');
      }),
      (e) => errors.push(e)
    );
    await service.load('D:\\w');
    assert.deepStrictEqual(service.current(), []);
    assert.strictEqual(errors.length, 1);
  });
});
