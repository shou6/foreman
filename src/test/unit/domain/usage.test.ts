import * as assert from 'assert';
import { contextUsage, formatTokens, tokensToday, turnTokens } from '../../../domain/usage';
import type { Task, Turn, Usage } from '../../../domain/task';

function usage(over: Partial<Usage> = {}): Usage {
  return {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadInputTokens: 80000,
    cacheCreationInputTokens: 3000,
    contextWindow: 200000,
    ...over,
  };
}

function turn(index: number, u?: Usage): Turn {
  return {
    index,
    prompt: 'p',
    attachments: [],
    startedAt: '',
    endedAt: u === undefined ? undefined : 't',
    result: u === undefined ? undefined : { ok: true, usage: u },
    changes: [],
  };
}

function task(turns: Turn[]): Pick<Task, 'turns'> {
  return { turns };
}

suite('usage: コンテキストの使用量', () => {
  test('最後に結果のあるターンの入力（キャッシュ込み）をコンテキストの使用量にする', () => {
    const t = task([turn(0, usage({ cacheReadInputTokens: 10 })), turn(1, usage())]);
    assert.deepStrictEqual(contextUsage(t), { used: 84000, window: 200000, ratio: 0.42 });
  });

  test('まだ動いているターンは飛ばして、前のターンの値を使う', () => {
    const t = task([turn(0, usage()), turn(1)]);
    assert.strictEqual(contextUsage(t)?.used, 84000);
  });

  test('結果が無ければ undefined。窓の大きさが無ければ ratio は undefined', () => {
    assert.strictEqual(contextUsage(task([turn(0)])), undefined);
    assert.strictEqual(contextUsage(task([])), undefined);
    const t = task([turn(0, usage({ contextWindow: 0 }))]);
    assert.deepStrictEqual(contextUsage(t), { used: 84000, window: undefined, ratio: undefined });
  });

  test('ターンごとのトークン: 入力（キャッシュ込み）と出力', () => {
    assert.deepStrictEqual(turnTokens(turn(0, usage())), { input: 84000, output: 500 });
    assert.strictEqual(turnTokens(turn(0)), undefined);
  });
});

suite('usage: 表示', () => {
  test('1000 未満はそのまま、k は小数 1 桁、100k 以上は整数', () => {
    assert.strictEqual(formatTokens(999), '999');
    assert.strictEqual(formatTokens(1500), '1.5k');
    assert.strictEqual(formatTokens(84000), '84k');
    assert.strictEqual(formatTokens(200000), '200k');
    assert.strictEqual(formatTokens(1250000), '1.3M');
  });
});

suite('usage: 今日のトークン（全タスク）', () => {
  test('今日（ローカルの日付）に終わったターンの入力と出力を全タスクで合計する', () => {
    const today = new Date(2026, 8, 24, 10, 0, 0);
    const at = (h: number, d = 24): string => new Date(2026, 8, d, h, 0, 0).toISOString();
    const u = usage({
      inputTokens: 100,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 50,
    });
    const tasks = [
      task([
        { ...turn(0, u), endedAt: at(9) },
        { ...turn(1, u), endedAt: at(23, 23) },
      ]),
      task([{ ...turn(0, u), endedAt: at(1) }, turn(1)]),
    ];
    assert.strictEqual(tokensToday(tasks, today), 300);
  });

  test('今日のターンが無ければ 0', () => {
    assert.strictEqual(tokensToday([task([])], new Date(2026, 8, 24)), 0);
  });
});
