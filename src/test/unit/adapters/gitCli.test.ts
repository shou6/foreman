import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitCli } from '../../../adapters/gitCli';

/** 一時フォルダに、コミットを 1 つ持つリポジトリを作る */
function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-git-'));
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return fs.realpathSync(dir);
}

suite('GitCli', function () {
  this.timeout(30_000);

  test('リポジトリのルートと今のブランチが分かる。Git でない場所は undefined', async () => {
    const repo = makeRepo();
    const git = new GitCli();
    fs.mkdirSync(path.join(repo, 'sub'));
    assert.strictEqual(
      path.resolve((await git.repoRoot(path.join(repo, 'sub'))) ?? ''),
      path.resolve(repo)
    );
    assert.strictEqual(await git.currentBranch(repo), 'main');
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-plain-'));
    assert.strictEqual(await git.repoRoot(plain), undefined);
  });

  test('worktree を作って一覧に出て、変更をコミットしてマージし、消せる', async () => {
    const repo = makeRepo();
    const git = new GitCli();
    const wt = path.join(repo, '.foreman', 'worktrees', 't-abc');
    await git.ensureExcluded(repo, '.foreman/');
    await git.addWorktree(repo, wt, 'foreman/t-abc', 'main');
    assert.ok(fs.existsSync(path.join(wt, 'a.txt')));
    const list = (await git.listWorktrees(repo)).map((p) => path.resolve(p));
    assert.ok(list.includes(path.resolve(wt)));

    assert.strictEqual(await git.hasChanges(wt), false);
    fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n');
    assert.strictEqual(await git.hasChanges(wt), true);
    await git.commitAll(wt, 'foreman: t');
    assert.strictEqual(await git.hasChanges(wt), false);

    await git.merge(repo, 'foreman/t-abc', 'Merge foreman/t-abc: t');
    assert.ok(fs.existsSync(path.join(repo, 'b.txt')));
    const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: repo, encoding: 'utf8' });
    assert.ok(log.includes('Merge foreman/t-abc'));

    await git.removeWorktree(repo, wt, true);
    await git.deleteBranch(repo, 'foreman/t-abc');
    assert.ok(!fs.existsSync(wt));
    const branches = execFileSync('git', ['branch', '--list'], { cwd: repo, encoding: 'utf8' });
    assert.ok(!branches.includes('foreman/t-abc'));
    // 除外は 1 回だけ書く
    await git.ensureExcluded(repo, '.foreman/');
    const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
    assert.strictEqual(exclude.split('\n').filter((l) => l === '.foreman/').length, 1);
  });

  test('衝突するとマージは失敗し、元のブランチは汚れない', async () => {
    const repo = makeRepo();
    const git = new GitCli();
    const wt = path.join(repo, '.foreman', 'worktrees', 't-conf');
    await git.ensureExcluded(repo, '.foreman/');
    await git.addWorktree(repo, wt, 'foreman/t-conf', 'main');
    fs.writeFileSync(path.join(wt, 'a.txt'), 'from worktree\n');
    await git.commitAll(wt, 'wt');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'from main\n');
    execFileSync('git', ['commit', '-q', '-am', 'main change'], { cwd: repo });
    await assert.rejects(git.merge(repo, 'foreman/t-conf', 'merge'), /conflict/i);
    assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'from main\n');
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });
});

suite('GitCli.ignored', function () {
  this.timeout(30_000);
  test('.gitignore に合うパスだけを返す。パスは渡したままの形で返す', async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, '.gitignore'), 'out/\n');
    const git = new GitCli();
    const result = await git.ignored(repo, ['out/a.js', 'src/a.ts', 'out/b/c.js']);
    assert.deepStrictEqual(result.sort(), ['out/a.js', 'out/b/c.js']);
    assert.deepStrictEqual(await git.ignored(repo, []), []);
  });

  test('Git でない場所では何も無視しない', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-plain-'));
    assert.deepStrictEqual(await new GitCli().ignored(plain, ['out/a.js']), []);
  });
});
