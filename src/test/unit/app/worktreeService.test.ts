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

suite('WorktreeService のコミットメッセージ', () => {
  function withWriter(
    write: (request: { repo: string; title: string; diff: string }) => Promise<string | undefined>
  ): { git: FakeGit; service: WorktreeService } {
    const git = new FakeGit(REPO, 'main');
    const service = new WorktreeService({ git, sep: '\\', commitMessage: write });
    return { git, service };
  }

  test('マージの前のコミットは、ステージした差分とタイトルから作ったメッセージを使う', async () => {
    const requests: { repo: string; title: string; diff: string }[] = [];
    const { git, service } = withWriter(async (request) => {
      requests.push(request);
      return 'feat(db): 集計を追加';
    });
    const wt = await service.create(REPO, 'Refactor auth', '0f3a9c12');
    git.dirty.set(wt.path, true);
    git.stagedDiffText = 'diff --git a/x b/x';
    await service.merge(wt, 'Refactor auth');
    assert.deepStrictEqual(requests, [
      { repo: REPO, title: 'Refactor auth', diff: 'diff --git a/x b/x' },
    ]);
    assert.deepStrictEqual(git.commits, [{ dir: wt.path, message: 'feat(db): 集計を追加' }]);
    assert.ok(!git.merges[0]?.message.includes('feat'), 'マージコミットは今のまま');
  });

  test('作れなかった時や失敗した時は、既定のメッセージにする', async () => {
    for (const write of [
      async () => undefined,
      async () => {
        throw new Error('not logged in');
      },
    ]) {
      const { git, service } = withWriter(write);
      const wt = await service.create(REPO, 'Refactor auth', '0f3a9c12');
      git.dirty.set(wt.path, true);
      await service.merge(wt, 'Refactor auth');
      assert.deepStrictEqual(git.commits, [{ dir: wt.path, message: 'chore: Refactor auth' }]);
    }
  });

  test('変更が無ければメッセージを作らない', async () => {
    let called = false;
    const { git, service } = withWriter(async () => {
      called = true;
      return 'x';
    });
    const wt = await service.create(REPO, 't', 'abcdef0123');
    await service.merge(wt, 't');
    assert.strictEqual(called, false);
    assert.deepStrictEqual(git.commits, []);
  });

  test('切り出しの前のコミットも同じようにメッセージを作る', async () => {
    const { git, service } = withWriter(async () => 'refactor: 認証を整理');
    const wt = await service.create(REPO, 'Parent', 'aaaaaa0000');
    git.dirty.set(wt.path, true);
    await service.commitWork(wt, 'Parent');
    assert.deepStrictEqual(git.commits, [{ dir: wt.path, message: 'refactor: 認証を整理' }]);
  });
});

suite('WorktreeService.merge', () => {
  test('worktree の変更をコミットしてから元のブランチへマージし、後片付けする', async () => {
    const { git, service } = build();
    const wt = await service.create(REPO, 'Refactor auth', '0f3a9c12');
    git.dirty.set(wt.path, true);
    await service.merge(wt, 'Refactor auth');
    assert.deepStrictEqual(git.commits, [{ dir: wt.path, message: 'chore: Refactor auth' }]);
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

  test('切り出したタスクは、表示どおり親のブランチ（親の worktree）へマージする', async () => {
    const { git, service } = build();
    const parent = await service.create(REPO, 'Parent', 'aaaaaa0000');
    const child = await service.create(REPO, 'Child', 'bbbbbb1111', parent.branch);
    assert.strictEqual(child.base, parent.branch);
    await service.merge(child, 'Child');
    assert.deepStrictEqual(
      git.merges.map((m) => ({ repo: m.repo, branch: m.branch })),
      [{ repo: parent.path, branch: child.branch }]
    );
  });

  test('マージ先のブランチがどこにもチェックアウトされていなければ、マージせずに止め、何も消さない', async () => {
    const { git, service } = build();
    const wt = await service.create(REPO, 't', 'abcdef0123');
    git.repos.get(REPO)!.branch = 'develop';
    await assert.rejects(service.merge(wt, 't'), /main/);
    assert.deepStrictEqual(git.merges, []);
    assert.strictEqual((await git.listWorktrees(REPO)).includes(wt.path), true);
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
