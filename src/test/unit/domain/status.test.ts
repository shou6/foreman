import * as assert from 'assert';
import { shortBranch, shortModel } from '../../../domain/labels';
import {
  approvalKindOf,
  pendingKindOf,
  primaryActionOf,
  statusKindOf,
  type StatusKind,
} from '../../../domain/status';
import { agoOf, splitElapsed } from '../../../domain/time';

suite('status: 状態の呼び名（サイドバー・ヘッダー・ボードで共通）', () => {
  test('返答を待つタスクは、承認待ち・質問あり・返答済みに分かれる', () => {
    assert.strictEqual(statusKindOf('waiting', true, 'approval'), 'approval');
    assert.strictEqual(statusKindOf('waiting', true, 'question'), 'question');
    assert.strictEqual(statusKindOf('waiting', false, undefined), 'replied');
  });

  test('ターンが開いたまま承認の要求が見えない時は、承認待ちとして扱う', () => {
    assert.strictEqual(statusKindOf('waiting', true, undefined), 'approval');
  });

  test('ほかの状態は、そのままの呼び名になる', () => {
    const cases: [Parameters<typeof statusKindOf>[0], StatusKind][] = [
      ['draft', 'draft'],
      ['running', 'running'],
      ['review', 'review'],
      ['done', 'done'],
      ['failed', 'failed'],
      ['interrupted', 'interrupted'],
    ];
    for (const [status, kind] of cases) {
      assert.strictEqual(statusKindOf(status, false, undefined), kind, status);
    }
  });

  test('AskUserQuestion の要求は質問、それ以外はツールの承認', () => {
    assert.strictEqual(
      pendingKindOf({
        toolName: 'AskUserQuestion',
        input: { questions: [{ question: 'q', options: [] }] },
        suggestions: [],
      }),
      'question'
    );
    assert.strictEqual(
      pendingKindOf({ toolName: 'Bash', input: { command: 'ls' }, suggestions: [] }),
      'approval'
    );
  });
});

suite('status: ボードのカードの主な操作', () => {
  test('状態ごとに 1 つだけ決まる', () => {
    assert.strictEqual(primaryActionOf('draft'), 'start');
    assert.strictEqual(primaryActionOf('running'), 'stop');
    assert.strictEqual(primaryActionOf('approval'), 'open');
    assert.strictEqual(primaryActionOf('question'), 'open');
    assert.strictEqual(primaryActionOf('failed'), 'open');
    assert.strictEqual(primaryActionOf('interrupted'), 'open');
    assert.strictEqual(primaryActionOf('replied'), 'markDone');
    assert.strictEqual(primaryActionOf('review'), 'approve');
    assert.strictEqual(primaryActionOf('done'), undefined);
  });
});

suite('status: 承認カードの問いかけ', () => {
  test('ツールの種類で問いかけを変える', () => {
    assert.strictEqual(approvalKindOf('Bash'), 'command');
    assert.strictEqual(approvalKindOf('Edit'), 'edit');
    assert.strictEqual(approvalKindOf('Write'), 'edit');
    assert.strictEqual(approvalKindOf('MultiEdit'), 'edit');
    assert.strictEqual(approvalKindOf('NotebookEdit'), 'edit');
    assert.strictEqual(approvalKindOf('WebFetch'), 'web');
    assert.strictEqual(approvalKindOf('WebSearch'), 'web');
    assert.strictEqual(approvalKindOf('mcp__x__y'), 'other');
  });
});

suite('labels: 短い表示名', () => {
  test('モデル名から claude- を外す', () => {
    assert.strictEqual(shortModel('claude-haiku-4-5'), 'haiku-4-5');
    assert.strictEqual(shortModel('opus'), 'opus');
  });

  test('ブランチ名から worktree の接頭辞を外す。接頭辞が無ければそのまま', () => {
    assert.strictEqual(shortBranch('foreman/task-2a0809', 'foreman/'), 'task-2a0809');
    assert.strictEqual(shortBranch('feature/x', 'foreman/'), 'feature/x');
    assert.strictEqual(shortBranch('foreman/x', ''), 'foreman/x');
    assert.strictEqual(shortBranch('foreman/x', undefined), 'foreman/x');
  });
});

suite('time: 何分前・経過時間', () => {
  const NOW = '2026-09-24T12:00:00.000Z';

  test('1 分未満は now、1 時間未満は分、1 日未満は時間、1 日は昨日、それより前は日数', () => {
    assert.deepStrictEqual(agoOf('2026-09-24T11:59:30.000Z', NOW), { unit: 'now', value: 0 });
    assert.deepStrictEqual(agoOf('2026-09-24T11:50:00.000Z', NOW), { unit: 'minutes', value: 10 });
    assert.deepStrictEqual(agoOf('2026-09-24T10:00:00.000Z', NOW), { unit: 'hours', value: 2 });
    assert.deepStrictEqual(agoOf('2026-09-23T10:00:00.000Z', NOW), { unit: 'yesterday', value: 1 });
    assert.deepStrictEqual(agoOf('2026-09-21T12:00:00.000Z', NOW), { unit: 'days', value: 3 });
  });

  test('未来の時刻や読めない時刻は now として扱う', () => {
    assert.deepStrictEqual(agoOf('2026-09-24T12:05:00.000Z', NOW), { unit: 'now', value: 0 });
    assert.deepStrictEqual(agoOf('x', NOW), { unit: 'now', value: 0 });
  });

  test('経過ミリ秒を分と秒に分ける（切り捨て、負は 0）', () => {
    assert.deepStrictEqual(splitElapsed(12_500), { minutes: 0, seconds: 12 });
    assert.deepStrictEqual(splitElapsed(72_000), { minutes: 1, seconds: 12 });
    assert.deepStrictEqual(splitElapsed(-5), { minutes: 0, seconds: 0 });
  });
});
