import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { copyFile, findFiles, runShell } from '../../../adapters/worktreeSetup';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-setup-'));
}

function write(root: string, relative: string, content = 'x'): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

suite('worktreeSetup: findFiles', () => {
  test('root からの相対の glob に合うファイルを、相対パスで返す。フォルダは返さない', async () => {
    const root = tempDir();
    write(root, '.env');
    write(root, '.env.local');
    write(root, 'config/app.local.json');
    write(root, 'config/app.json');
    fs.mkdirSync(path.join(root, '.env.d'));
    const found = await findFiles(root, ['.env*', 'config/*.local.json']);
    assert.deepStrictEqual(found.sort(), [
      '.env',
      '.env.local',
      path.join('config', 'app.local.json'),
    ]);
  });

  test('.git と .foreman の中は見ない（ほかのタスクの worktree をコピーしない）', async () => {
    const root = tempDir();
    write(root, 'sub/.env');
    write(root, '.git/.env');
    write(root, '.foreman/worktrees/other/.env');
    const found = await findFiles(root, ['**/.env']);
    assert.deepStrictEqual(found, [path.join('sub', '.env')]);
  });
});

suite('worktreeSetup: copyFile', () => {
  test('コピー先のフォルダが無ければ作る', async () => {
    const root = tempDir();
    write(root, 'a/b.txt', 'hello');
    const to = path.join(root, 'wt', 'a', 'b.txt');
    await copyFile(path.join(root, 'a', 'b.txt'), to);
    assert.strictEqual(fs.readFileSync(to, 'utf8'), 'hello');
  });
});

suite('worktreeSetup: runShell', function () {
  this.timeout(20_000);

  test('cwd でシェルのコマンドを実行し、出力を log へ流す', async () => {
    const cwd = tempDir();
    const lines: string[] = [];
    await runShell(cwd, 'node -e "console.log(process.cwd())"', { log: (s) => lines.push(s) });
    assert.match(lines.join(''), new RegExp(path.basename(cwd)));
  });

  test('0 以外で終わったら、終了コードを付けて失敗にする', async () => {
    await assert.rejects(runShell(tempDir(), 'node -e "process.exit(3)"', { log: () => {} }), /3/);
  });

  test('中止すると、プロセスを止めて失敗にする', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const running = runShell(tempDir(), 'node -e "setTimeout(() => {}, 15000)"', {
      log: () => {},
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 500);
    await assert.rejects(running, /cancel/i);
    assert.ok(Date.now() - started < 10_000, '止まるまでに時間がかかりすぎた');
  });
});
