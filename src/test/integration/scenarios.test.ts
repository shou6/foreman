import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { FileChange } from '../../domain/task';
import type { TestApi } from '../../extension';

/**
 * 実際の VS Code の中で、Claude の代わりに台本の Runner を動かして流れを確かめる（M12）。
 * .vscode-test.mjs が FOREMAN_SCRIPTED_RUNNER=1 を渡すので、拡張機能は testApi を返す。
 * 画面のクリックはしない。コマンドとサービスの状態で確かめる
 */
const settle = (ms = 50): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 条件が満たされるまで待つ。保存はファイルなので、イベントの処理が終わる時間は決め打ちできない */
async function until(
  check: () => Promise<boolean>,
  what: string | (() => Promise<string>)
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('待ちきれなかった: ' + (typeof what === 'string' ? what : await what()));
}

async function untilStatus(t: TestApi, id: string, status: string): Promise<void> {
  await until(
    async () => (await t.service.load(id))?.status === status,
    async () => 'status ' + status + ' / now: ' + JSON.stringify(await t.service.load(id))
  );
}

async function api(): Promise<TestApi> {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
  ) as { name: string; publisher: string };
  const extension = vscode.extensions.getExtension<{ testApi?: TestApi }>(
    manifest.publisher + '.' + manifest.name
  );
  assert.ok(extension, '拡張機能が見つからない');
  const exports = await extension.activate();
  assert.ok(exports.testApi, 'testApi が無い。FOREMAN_SCRIPTED_RUNNER=1 で起動しているか');
  return exports.testApi;
}

/** タスクの作業ディレクトリ。Git でない一時フォルダ（worktree の質問が出ない） */
function workDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-scenario-'));
}

async function clearTasks(t: TestApi): Promise<void> {
  for (const task of await t.service.list()) {
    await t.service.delete(task.id);
  }
}

suite('Scenario: 完了の定義', function () {
  this.timeout(30_000);

  test('変更の無いターンが終わると入力待ち、「変更を承認」で完了になる', async () => {
    const t = await api();
    await clearTasks(t);
    const task = await t.service.create({ prompt: 'say hi', cwd: workDir() });
    assert.strictEqual(task.status, 'running');
    assert.strictEqual(t.runner.last.options.prompt, 'say hi');

    t.runner.last.emit({ type: 'init', sessionId: 'sess-1', model: 'claude-haiku-4-5' });
    t.runner.last.emit({ type: 'text', text: 'hi' });
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'waiting');

    await vscode.commands.executeCommand('foreman.approveTask', task.id);
    await untilStatus(t, task.id, 'done');
  });

  test('ファイルを変えたターンはレビュー待ちになり、差分カードの材料が記録される', async () => {
    const t = await api();
    await clearTasks(t);
    const cwd = workDir();
    const file = path.join(cwd, 'a.txt');
    fs.writeFileSync(file, 'before\n');
    const task = await t.service.create({ prompt: 'edit a.txt', cwd });

    t.runner.last.emit({ type: 'file-edit', phase: 'before', path: file });
    // 変更前のスナップショットを読み終えてから書き換える
    await settle(300);
    fs.writeFileSync(file, 'before\nafter\n');
    t.runner.last.emit({ type: 'file-edit', phase: 'after', path: file });
    await settle();
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'review');

    const reviewed = await t.service.load(task.id);
    assert.strictEqual(reviewed?.status, 'review');
    assert.deepStrictEqual(
      reviewed?.turns[0]?.changes.map((c: FileChange) => [c.path, c.kind, c.added, c.removed]),
      [['a.txt', 'modified', 1, 0]]
    );

    await t.diffs.revert(task.id, 0, 'a.txt');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'before\n');
    assert.strictEqual((await t.service.load(task.id))?.turns[0]?.changes[0]?.reverted, true);
  });

  test('追加の指示は同じセッションへ送られ、実行中に戻る', async () => {
    const t = await api();
    await clearTasks(t);
    const task = await t.service.create({ prompt: 'first', cwd: workDir() });
    t.runner.last.emit({ type: 'init', sessionId: 'sess-2', model: 'm' });
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'waiting');
    await t.service.send(task.id, 'second');
    assert.strictEqual((await t.service.load(task.id))?.status, 'running');
    assert.deepStrictEqual(t.runner.last.sent, ['second']);
  });
});

suite('Scenario: 承認と停止', function () {
  this.timeout(30_000);

  test('ツールの承認を求めると入力待ちになり、答えると実行中に戻る', async () => {
    const t = await api();
    await clearTasks(t);
    const task = await t.service.create({ prompt: 'run', cwd: workDir() });
    const decision = t.runner.last.requestPermission({
      toolName: 'Bash',
      input: { command: 'ls' },
      suggestions: [],
    });
    await untilStatus(t, task.id, 'waiting');
    const pending = t.approvals.pending(task.id);
    assert.ok(pending, '承認の要求が画面側に届いていない');
    t.approvals.decide(task.id, pending.id, { behavior: 'allow' });
    assert.deepStrictEqual(await decision, { behavior: 'allow' });
    await untilStatus(t, task.id, 'running');
  });

  test('停止コマンドで中断になる', async () => {
    const t = await api();
    await clearTasks(t);
    const task = await t.service.create({ prompt: 'long', cwd: workDir() });
    await vscode.commands.executeCommand('foreman.stopTask', task.id);
    await untilStatus(t, task.id, 'interrupted');
    assert.strictEqual(t.runner.last.interrupted, true);
  });
});

suite('Scenario: 下書きと画面', function () {
  this.timeout(30_000);

  test('下書きは起動せず、開始コマンドで最初のターンが動く', async () => {
    const t = await api();
    await clearTasks(t);
    const starts = t.runner.starts.length;
    const draft = await t.service.createDraft({ prompt: 'later', cwd: workDir() });
    assert.strictEqual(draft.status, 'draft');
    assert.strictEqual(t.runner.starts.length, starts);
    await vscode.commands.executeCommand('foreman.startTask', draft.id);
    await untilStatus(t, draft.id, 'running');
    assert.strictEqual(t.runner.starts.length, starts + 1);
    assert.strictEqual(t.panels.activeTaskId, draft.id, '開始したタスクの画面が前面に出る');
  });

  test('タスク画面を開くと、右サイドバーとステータスバーが追う「今見ているタスク」になる', async () => {
    const t = await api();
    await clearTasks(t);
    const a = await t.service.create({ prompt: 'a', cwd: workDir() });
    const b = await t.service.create({ prompt: 'b', cwd: workDir() });
    await vscode.commands.executeCommand('foreman.openTask', a.id);
    assert.strictEqual(t.panels.activeTaskId, a.id);
    await vscode.commands.executeCommand('foreman.openTask', b.id);
    assert.strictEqual(t.panels.activeTaskId, b.id);
    await vscode.commands.executeCommand('foreman.openBoard');
  });
});
