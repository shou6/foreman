import * as assert from 'assert';
import { execFileSync } from 'child_process';
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

  test('承認を取り消すと、承認の前の状態（入力待ち）に戻る', async () => {
    const t = await api();
    await clearTasks(t);
    const task = await t.service.create({ prompt: 'say hi', cwd: workDir() });
    t.runner.last.emit({ type: 'init', sessionId: 'sess-u', model: 'claude-haiku-4-5' });
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'waiting');
    await vscode.commands.executeCommand('foreman.approveTask', task.id);
    await untilStatus(t, task.id, 'done');

    await vscode.commands.executeCommand('foreman.unapproveTask', task.id);
    await untilStatus(t, task.id, 'waiting');
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

suite('Scenario: 完了の後に続きを指示する', function () {
  this.timeout(30_000);

  test('完了したタスクに続きを指示してファイルが変わると、完了ではなくレビュー待ちに戻る', async () => {
    const t = await api();
    await clearTasks(t);
    const cwd = workDir();
    const file = path.join(cwd, 'a.txt');
    fs.writeFileSync(file, 'v1\n');
    const task = await t.service.create({ prompt: 'first', cwd });
    t.runner.last.emit({ type: 'init', sessionId: 'sess-3', model: 'm' });
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'waiting');
    await t.service.approve(task.id);
    await untilStatus(t, task.id, 'done');

    await t.service.send(task.id, 'second');
    await untilStatus(t, task.id, 'running');
    t.runner.last.emit({ type: 'file-edit', phase: 'before', path: file });
    await settle(300);
    fs.writeFileSync(file, 'v1\nv2\n');
    t.runner.last.emit({ type: 'file-edit', phase: 'after', path: file });
    await settle();
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'review');
    assert.strictEqual((await t.service.load(task.id))?.turns[1]?.changes.length, 1);
  });
});

suite('Scenario: 計画をエディターで開く', function () {
  this.timeout(20000);

  test('計画は読み取り専用の Markdown として開き、開き直すと新しい計画に置き換わる', async () => {
    const t = await api();
    const uri = await t.plans.open('task-plan', 'Refactor', '# Plan\n\n1. Read');
    assert.strictEqual(uri.scheme, 'foreman-plan');
    assert.ok(uri.path.endsWith('.md'), uri.path);
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(doc.getText(), '# Plan\n\n1. Read');
    assert.strictEqual(doc.languageId, 'markdown');

    const again = await t.plans.open('task-plan', 'Refactor', '# Plan v2');
    assert.strictEqual(again.toString(), uri.toString(), '同じタスクは同じ文書を使う');
    await until(
      async () => (await vscode.workspace.openTextDocument(uri)).getText() === '# Plan v2',
      '計画の置き換え'
    );
  });
});

suite('Scenario: 常に許可（受け入れ 9.3）', function () {
  this.timeout(30_000);

  test('「このタスクでは常に許可」は、そのタスクの再開に引き継ぎ、別のタスクには効かない', async () => {
    const t = await api();
    await clearTasks(t);
    const rule = {
      type: 'addRules',
      behavior: 'allow',
      destination: 'session',
      rules: [{ toolName: 'Edit' }],
    };
    const task = await t.service.create({ prompt: 'edit', cwd: workDir() });
    t.runner.last.emit({ type: 'init', sessionId: 'sess-allow', model: 'm' });
    const decision = t.runner.last.requestPermission({
      toolName: 'Edit',
      input: { file_path: 'a.txt' },
      suggestions: [rule],
    });
    await untilStatus(t, task.id, 'waiting');
    const pending = t.approvals.pending(task.id);
    assert.ok(pending);
    t.approvals.decide(task.id, pending.id, { behavior: 'allow-always', permissions: [rule] });
    assert.deepStrictEqual(await decision, { behavior: 'allow-always', permissions: [rule] });
    await until(
      async () => (await t.service.load(task.id))?.alwaysAllowed.length === 1,
      '常に許可の保存'
    );

    // プロセスが終わった後の次の指示（再開）にも、許可を引き継ぐ
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'waiting');
    t.runner.last.close();
    await settle(100);
    await t.service.send(task.id, 'edit again');
    assert.strictEqual(t.runner.resumes.at(-1)?.sessionId, 'sess-allow');
    assert.deepStrictEqual(t.runner.last.options.alwaysAllowed, [rule]);

    // 別のタスクには効かない
    await t.service.create({ id: 'other-task', prompt: 'edit', cwd: workDir() });
    assert.deepStrictEqual(t.runner.last.options.alwaysAllowed, []);
  });
});

suite('Scenario: 添付（受け入れ 9.5）', function () {
  this.timeout(30_000);

  test('エクスプローラーの「タスクに添付」とドロップで入力欄に添付され、送るとファイルのパスが指示に付く', async () => {
    const t = await api();
    await clearTasks(t);
    const cwd = workDir();
    const a = path.join(cwd, 'a.txt');
    const b = path.join(cwd, 'b.txt');
    fs.writeFileSync(a, 'a\n');
    fs.writeFileSync(b, 'b\n');
    const task = await t.service.create({ prompt: 'first', cwd });
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'waiting');

    // エクスプローラーの右クリック（タスクが 1 つなら選ぶ画面は出ない）
    await vscode.commands.executeCommand('foreman.attachToTask', vscode.Uri.file(a));
    // エクスプローラーからタスク画面へのドロップ
    t.panels.attachUris(task.id, [vscode.Uri.file(b).toString()]);
    // VS Code の URI から取るパス（Windows ではドライブ文字が小文字になる）
    const fsA = vscode.Uri.file(a).fsPath;
    const fsB = vscode.Uri.file(b).fsPath;
    const attachments = t.panels.attachmentsOf(task.id);
    assert.deepStrictEqual(
      attachments.map((x) => (x.kind === 'file' ? x.path : x.kind)),
      [fsA, fsB]
    );

    await t.service.send(task.id, 'use them', attachments);
    assert.deepStrictEqual(t.runner.last.sent, [`use them\n\nAttached files:\n- ${fsA}\n- ${fsB}`]);
  });
});

suite('Scenario: 失敗（受け入れ 9.6）', function () {
  this.timeout(30_000);

  test('claude CLI の場所が誤っていると、設定を案内するエラーになり、タスクは失敗になる', async () => {
    const t = await api();
    await clearTasks(t);
    const missing = path.join(workDir(), 'no-such-claude.exe');
    const config = vscode.workspace.getConfiguration('foreman');
    await config.update('claudePath', missing, vscode.ConfigurationTarget.Global);
    try {
      assert.throws(() => t.locateClaude(), /foreman\.claudePath/);
      const reason = (() => {
        try {
          t.locateClaude();
          return '';
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      })();
      // 起動できなかった Runner は、その理由で失敗のターンを終える
      const task = await t.service.create({ prompt: 'hi', cwd: workDir() });
      t.runner.last.emit({ type: 'turn-end', ok: false, interrupted: false, reason });
      await untilStatus(t, task.id, 'failed');
      const result = (await t.service.load(task.id))?.turns[0]?.result;
      assert.ok(result !== undefined && !result.ok && result.reason.includes('foreman.claudePath'));
    } finally {
      await config.update('claudePath', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});

suite('Scenario: 監視で拾う変更（VS Code のファイル監視）', function () {
  this.timeout(30_000);

  test('編集ツール以外（シェルなど）の変更も、ターンの間に監視で拾って記録する', async () => {
    const t = await api();
    await clearTasks(t);
    const cwd = workDir();
    const task = await t.service.create({ prompt: 'run a script', cwd });
    t.runner.last.emit({ type: 'init', sessionId: 'sess-w', model: 'm' });
    // 監視が始まるのを待ってから、編集ツールを通さずにファイルを作る
    await settle(500);
    fs.writeFileSync(path.join(cwd, 'made-by-shell.txt'), 'x\n');
    await until(async () => {
      const current = await t.service.load(task.id);
      return current !== undefined && t.diffs.pendingPaths(task.id).includes('made-by-shell.txt');
    }, '監視がファイルを拾う');
    t.runner.last.emit({ type: 'turn-end', ok: true });
    await untilStatus(t, task.id, 'review');
    const change = (await t.service.load(task.id))?.turns[0]?.changes[0];
    assert.strictEqual(change?.path, 'made-by-shell.txt');
    assert.strictEqual(change?.source, 'watcher');
    // 監視で拾った変更は、変更前が分からない（新規作成かどうかも判別できない）
    assert.strictEqual(change?.before, undefined);
  });
});

suite('Scenario: worktree の準備', function () {
  this.timeout(60_000);

  test('設定したファイルを本体からコピーし、準備のコマンドを worktree で走らせる', async () => {
    const t = await api();
    const repo = workDir();
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    };
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n');
    fs.writeFileSync(path.join(repo, '.env'), 'SECRET=1\n');
    git('add', '.gitignore');
    git('commit', '-m', 'init');

    const config = vscode.workspace.getConfiguration('foreman');
    await config.update('worktreeCopyFiles', ['.env'], vscode.ConfigurationTarget.Global);
    await config.update(
      'worktreeSetupCommand',
      `node -e "require('fs').writeFileSync('setup-ran.txt', 'ok')"`,
      vscode.ConfigurationTarget.Global
    );
    try {
      const wt = await t.worktrees.create(repo, 'setup', 'abcdef12-0000');
      assert.strictEqual(fs.readFileSync(path.join(wt.path, '.env'), 'utf8'), 'SECRET=1\n');
      assert.strictEqual(fs.readFileSync(path.join(wt.path, 'setup-ran.txt'), 'utf8'), 'ok');
      await t.worktrees.discard(wt);
    } finally {
      await config.update('worktreeCopyFiles', undefined, vscode.ConfigurationTarget.Global);
      await config.update('worktreeSetupCommand', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
