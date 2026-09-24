import * as assert from 'assert';
import {
  defaultModelName,
  FALLBACK_MODELS,
  isSameModel,
  modelLabel,
  modelsFromSdk,
  type ModelOption,
} from '../../../domain/models';

suite('models: Claude Code が返すモデルの一覧', () => {
  test('default は「既定」の説明に回し、残りを選択肢にする。画面の名前と説明と、実際のモデルを持つ', () => {
    const list = modelsFromSdk([
      {
        value: 'default',
        resolvedModel: 'claude-opus-5-5[1m]',
        displayName: 'Default (recommended)',
        description: 'Opus 5.5 with 1M context',
      },
      {
        value: 'sonnet',
        resolvedModel: 'claude-sonnet-5',
        displayName: 'Sonnet',
        description: 'Sonnet 5',
      },
      { value: 'haiku', displayName: 'Haiku', description: '' },
    ]);
    assert.deepStrictEqual(list.defaultModel, {
      value: 'default',
      label: 'Default (recommended)',
      description: 'Opus 5.5 with 1M context',
      resolved: 'claude-opus-5-5[1m]',
    });
    assert.deepStrictEqual(list.models, [
      { value: 'sonnet', label: 'Sonnet', description: 'Sonnet 5', resolved: 'claude-sonnet-5' },
      { value: 'haiku', label: 'Haiku', description: '', resolved: undefined },
    ]);
  });

  test('一覧が空なら固定の一覧を使う', () => {
    assert.deepStrictEqual(modelsFromSdk([]), { models: FALLBACK_MODELS, defaultModel: undefined });
  });

  test('固定の一覧は、名前をそのまま画面にも出す', () => {
    assert.ok(FALLBACK_MODELS.length > 0);
    for (const m of FALLBACK_MODELS) {
      assert.strictEqual(m.label, m.value);
    }
  });
});

suite('models: 実際に動いたモデルとの照合', () => {
  const sonnet: ModelOption = {
    value: 'sonnet',
    label: 'Sonnet',
    description: '',
    resolved: 'claude-sonnet-5',
  };

  test('名前か実際のモデルが一致すれば同じ。日付付きの版も同じとみなす', () => {
    assert.strictEqual(isSameModel('claude-sonnet-5', sonnet), true);
    assert.strictEqual(isSameModel('sonnet', sonnet), true);
    assert.strictEqual(isSameModel('claude-sonnet-5-20260101', sonnet), true);
    assert.strictEqual(isSameModel('claude-haiku-4-5', sonnet), false);
  });

  test('日付でない続き（版の違い）は別のモデル。claude-opus-5 は Opus 5.5 ではない', () => {
    const opus: ModelOption = {
      value: 'opus[1m]',
      label: 'Opus (1M context)',
      description: '',
      resolved: 'claude-opus-5-5[1m]',
    };
    assert.strictEqual(isSameModel('claude-opus-5', opus), false);
    assert.strictEqual(isSameModel('claude-opus-5-5[1m]', opus), true);
    const haiku: ModelOption = {
      value: 'haiku',
      label: 'Haiku',
      description: '',
      resolved: 'claude-haiku-4-5-20251001',
    };
    assert.strictEqual(isSameModel('claude-haiku-4-5', haiku), true);
    assert.strictEqual(isSameModel('claude-haiku-4', haiku), false);
  });

  test('実際のモデルが分からない選択肢は、名前だけで比べる', () => {
    const custom: ModelOption = { value: 'claude-x', label: 'claude-x', description: '' };
    assert.strictEqual(isSameModel('claude-x', custom), true);
    assert.strictEqual(isSameModel('claude-y', custom), false);
  });

  test('画面に出す名前。一覧にあればその名前、無ければ claude- を外した名前', () => {
    assert.strictEqual(modelLabel('claude-sonnet-5', [sonnet]), 'Sonnet');
    assert.strictEqual(modelLabel('claude-haiku-4-5', [sonnet]), 'haiku-4-5');
  });
});

suite('models: 既定のモデルの名前', () => {
  const opus: ModelOption = {
    value: 'default',
    label: 'Default (recommended)',
    description: 'Opus 5.5 with 1M context · Best for everyday, complex tasks',
    resolved: 'claude-opus-5-5[1m]',
  };

  test('説明の先頭（· と with の前）から、推奨モデルの名前を取り出す', () => {
    assert.strictEqual(defaultModelName(opus), 'Opus 5.5');
    assert.strictEqual(
      defaultModelName({ ...opus, description: 'Sonnet 5 · Efficient for routine tasks' }),
      'Sonnet 5'
    );
  });

  test('説明が無ければ実際のモデルの名前。どちらも無ければ undefined', () => {
    assert.strictEqual(defaultModelName({ ...opus, description: '' }), 'opus-5-5[1m]');
    assert.strictEqual(
      defaultModelName({ value: 'default', label: 'Default', description: '' }),
      undefined
    );
    assert.strictEqual(defaultModelName(undefined), undefined);
  });
});
