import * as assert from 'assert';
import { ModelService } from '../../../app/modelService';
import { FALLBACK_MODELS } from '../../../domain/models';
import type { ModelCatalog } from '../../../ports/modelCatalog';

const SONNET = { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 5' };

function catalog(result: () => Promise<unknown>): ModelCatalog & { calls: number } {
  const c = {
    calls: 0,
    list: async () => {
      c.calls++;
      return (await result()) as never;
    },
  };
  return c;
}

suite('ModelService', () => {
  test('取得する前は固定の一覧を返す', () => {
    const service = new ModelService(catalog(async () => [SONNET]));
    assert.deepStrictEqual(service.current().models, FALLBACK_MODELS);
  });

  test('取得すると一覧が入れ替わり、変わったことを知らせる', async () => {
    const service = new ModelService(catalog(async () => [SONNET]));
    let changed = 0;
    service.onDidChange(() => changed++);
    await service.load();
    assert.deepStrictEqual(
      service.current().models.map((m) => m.label),
      ['Sonnet']
    );
    assert.strictEqual(changed, 1);
  });

  test('取得は 1 回だけ。2 回目以降は覚えている一覧を使う', async () => {
    const c = catalog(async () => [SONNET]);
    const service = new ModelService(c);
    await Promise.all([service.load(), service.load()]);
    await service.load();
    assert.strictEqual(c.calls, 1);
  });

  test('取得に失敗したら固定の一覧のまま。失敗は知らせるだけで例外にしない', async () => {
    const errors: unknown[] = [];
    const service = new ModelService(
      catalog(async () => {
        throw new Error('Claude Code CLI was not found');
      }),
      (error) => errors.push(error)
    );
    await service.load();
    assert.deepStrictEqual(service.current().models, FALLBACK_MODELS);
    assert.strictEqual(errors.length, 1);
  });
});
