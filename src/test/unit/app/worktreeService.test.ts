import * as assert from 'assert';
import { WorktreeService } from '../../../app/worktreeService';
import { FakeGit } from '../../support/fakes/fakeGit';

const REPO = 'D:\\work\\repo';

function build(): { git: FakeGit; service: WorktreeService } {
  const git = new FakeGit(REPO, 'main');
  const service = new WorktreeService({ git, sep: '\\' });
  return { git, service };
}

suite('WorktreeService.create', () => {
  test('リポジトリ内に worktree を作り、除外を書き、場所とブランチを返す', async () => {
    const { git, service } = build();
    const result = await service.create(REPO, 'Refactor auth', '0f3a9c12-aaaa');
    assert.deepStrictEqual(result, {
      repo: REPO,
      path: 'D:\\work\\repo\\.foreman\\worktrees\\refactor-auth-0f3a9c',
      branch: 'foreman/refactor-auth-0f3a9c',
      base: 'main',
    });
    assert.deepStrictEqual(git.excluded.get(REPO), ['.foreman/']);
    assert.ok(git.calls.includes(`addWorktree ${result.path} ${result.branch} main`));
  });

  test('Git でないフォルダでは作れない', async () => {
    const { service } = build();
    await assert.rejects(service.create('D:\\other', 't', 'id'), /not a Git repository/);
  });

  test('detached HEAD では作れない', async () => {
    const { git, service } = build();
    git.repos.get(REPO)!.branch = undefined as unknown as string;
    await assert.rejects(service.create(REPO, 't', 'id'), /branch/);
  });
});

suite('WorktreeService.merge', () => {
  test('worktree の変更をコミットしてから元のブランチへマージし、後片付けする', async () => {
    const { git, service } = build();
    const wt = await service.create(REPO, 'Refactor auth', '0f3a9c12');
    git.dirty.set(wt.path, true);
    await service.merge(wt, 'Refactor auth');
    assert.deepStrictEqual(git.commits, [{ dir: wt.path, message: 'foreman: Refactor auth' }]);
    assert.deepStrictEqual(git.merges, [
      {
        repo: REPO,
        branch: wt.branch,
        message: 'Merge foreman/refactor-auth-0f3a9c: Refactor auth',
      },
    ]);
    assert.strictEqual((await git.listWorktrees(REPO)).includes(wt.path), false);
    assert.strictEqual(git.repos.get(REPO)!.branches.has(wt.branch), false);
  });

  test('マージに失敗したら worktree とブランチは残す', async () => {
    const { git, service } = build();
    const wt = await service.create(REPO, 't', 'abcdef0123');
    git.mergeError = 'CONFLICT (content): README.md';
    await assert.rejects(service.merge(wt, 't'), /CONFLICT/);
    assert.strictEqual((await git.listWorktrees(REPO)).includes(wt.path), true);
    assert.strictEqual(git.repos.get(REPO)!.branches.has(wt.branch), true);
  });
});

suite('WorktreeService.discard', () => {
  test('未コミットの変更があっても worktree とブランチを消す', async () => {
    const { git, service } = build();
    const wt = await service.create(REPO, 't', 'abcdef0123');
    git.dirty.set(wt.path, true);
    await service.discard(wt);
    assert.strictEqual((await git.listWorktrees(REPO)).includes(wt.path), false);
    assert.strictEqual(git.repos.get(REPO)!.branches.has(wt.branch), false);
  });

  test('hasChanges で未マージの変更の有無が分かる', async () => {
    const { git, service } = build();
    const wt = await service.create(REPO, 't', 'abcdef0123');
    assert.strictEqual(await service.hasChanges(wt), false);
    git.dirty.set(wt.path, true);
    assert.strictEqual(await service.hasChanges(wt), true);
  });
});

suite('WorktreeService.cleanupOrphans', () => {
  test('.foreman/worktrees の下にあって、タスクが使っていない worktree を消す', async () => {
    const { git, service } = build();
    const used = await service.create(REPO, 'used', 'aaaaaa0000');
    const orphan = await service.create(REPO, 'orphan', 'bbbbbb0000');
    await service.cleanupOrphans(REPO, [used.path]);
    const list = await git.listWorktrees(REPO);
    assert.ok(list.includes(used.path));
    assert.ok(!list.includes(orphan.path));
    assert.ok(list.includes(REPO), 'メインの作業ツリーは消さない');
  });
});
