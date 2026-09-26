import * as assert from 'assert';
import { statusBarView } from '../../../domain/statusBarView';
import type { RateLimits } from '../../../domain/rateLimits';
import type { Task, TaskStatus } from '../../../domain/task';

function task(id: string, status: TaskStatus, model?: string): Task {
  return {
    id,
    title: id,
    status,
    cwd: 'D:\\w',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [],
    createdAt: '',
    updatedAt: '',
    model,
  };
}

/** 翻訳の代わりに {0} などを埋めるだけ */
const t = (message: string, ...args: string[]): string =>
  message.replace(/\{(\d+)\}/g, (_, i: string) => args[Number(i)] ?? '');

const LIMITS: RateLimits = {
  fiveHour: { utilization: 10, resetsAt: undefined },
  sevenDay: { utilization: 2, resetsAt: undefined },
  models: [{ name: 'Fable', utilization: 3, resetsAt: undefined }],
  fetchedAt: '2026-09-26T00:00:00.000Z',
};

const ALL = ['fiveHour', 'sevenDay', 'models'] as const;

suite('statusBarView', () => {
  test('Foreman の項目には実行中の件数だけを出し、「あなたの番」は説明（ツールチップ）にだけ出す', () => {
    const view = statusBarView(
      { tasks: [task('a', 'running'), task('b', 'waiting')], planUsageItems: [...ALL] },
      t
    );
    assert.strictEqual(view.foreman?.text, 'Foreman: $(sync~spin) 1 running');
    assert.strictEqual(view.foreman?.tooltip, 'Foreman: 1 running, 1 waiting for you');
  });

  test('「あなたの番」しか無ければ、Foreman の項目は出さない', () => {
    const view = statusBarView({ tasks: [task('a', 'waiting')], planUsageItems: [...ALL] }, t);
    assert.strictEqual(view.foreman, undefined);
  });

  test('今見ているタスクのモデルを Foreman の項目に出す', () => {
    const view = statusBarView(
      { tasks: [task('a', 'waiting', 'opus')], activeId: 'a', planUsageItems: [...ALL] },
      t
    );
    assert.strictEqual(view.foreman?.text, 'Foreman: $(tasklist) opus');
  });

  test('契約の利用枠は、「Claude:」を付けた別の項目に出す', () => {
    const view = statusBarView(
      { tasks: [task('a', 'running')], limits: LIMITS, planUsageItems: [...ALL] },
      t
    );
    assert.strictEqual(view.foreman?.text, 'Foreman: $(sync~spin) 1 running');
    assert.strictEqual(view.claude?.text, 'Claude: 5h 10% · 7d 2% · Fable 3%');
    assert.strictEqual(view.claude?.tooltip, 'Plan usage: 5-hour 10%, 7-day 2%\nFable: 3%');
  });

  test('タスクが無くても、利用枠があれば Claude の項目だけを出す', () => {
    const view = statusBarView({ tasks: [], limits: LIMITS, planUsageItems: [...ALL] }, t);
    assert.strictEqual(view.foreman, undefined);
    assert.strictEqual(view.claude?.text, 'Claude: 5h 10% · 7d 2% · Fable 3%');
  });

  test('出す項目が空か、利用枠が無ければ Claude の項目は出さない', () => {
    assert.strictEqual(
      statusBarView({ tasks: [], limits: LIMITS, planUsageItems: [] }, t).claude,
      undefined
    );
    assert.strictEqual(statusBarView({ tasks: [], planUsageItems: [...ALL] }, t).claude, undefined);
  });
});
