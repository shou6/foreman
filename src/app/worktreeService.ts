import type { Worktree } from '../domain/task';
import { branchName, worktreeName, worktreePath, WORKTREE_DIR } from '../domain/worktree';
import type { Git } from '../ports/git';

export interface WorktreeServiceDeps {
  git: Git;
  /** パスの区切り（Windows は \\） */
  sep: string;
}

/** タスクごとの git worktree の作成・マージ・破棄（FR-TASK-10、要件定義書 5.1） */
export class WorktreeService {
  constructor(private readonly deps: WorktreeServiceDeps) {}

  /** dir が Git リポジトリの中なら、そのルート */
  repoRoot(dir: string): Promise<string | undefined> {
    return this.deps.git.repoRoot(dir);
  }

  /** リポジトリ内の .foreman/worktrees/<名前> に、今のブランチから worktree を作る */
  async create(dir: string, title: string, taskId: string): Promise<Worktree> {
    const repo = await this.deps.git.repoRoot(dir);
    if (repo === undefined) {
      throw new Error(`"${dir}" is not a Git repository`);
    }
    const base = await this.deps.git.currentBranch(repo);
    if (base === undefined) {
      throw new Error('The repository is not on a branch (detached HEAD)');
    }
    const name = worktreeName(title, taskId);
    const worktree: Worktree = {
      repo,
      path: worktreePath(repo, name, this.deps.sep),
      branch: branchName(name),
      base,
    };
    await this.deps.git.ensureExcluded(repo, WORKTREE_DIR.split('/')[0] + '/');
    await this.deps.git.addWorktree(repo, worktree.path, worktree.branch, base);
    return worktree;
  }

  /** 未マージの変更（未コミットの変更）があるか */
  hasChanges(worktree: Worktree): Promise<boolean> {
    return this.deps.git.hasChanges(worktree.path);
  }

  /**
   * worktree の変更をコミットし、元のブランチへマージして、worktree とブランチを消す。
   * マージに失敗した時は何も消さない
   */
  async merge(worktree: Worktree, title: string): Promise<void> {
    await this.deps.git.commitAll(worktree.path, `foreman: ${title}`);
    await this.deps.git.merge(worktree.repo, worktree.branch, `Merge ${worktree.branch}: ${title}`);
    await this.remove(worktree);
  }

  /** 変更ごと捨てる */
  discard(worktree: Worktree): Promise<void> {
    return this.remove(worktree);
  }

  /** .foreman/worktrees の下にあって、どのタスクも使っていない worktree を消す */
  async cleanupOrphans(repo: string, inUse: readonly string[]): Promise<void> {
    const prefix = worktreePath(repo, '', this.deps.sep);
    for (const path of await this.deps.git.listWorktrees(repo)) {
      if (path.startsWith(prefix) && path !== repo && !inUse.includes(path)) {
        const name = path.slice(prefix.length);
        await this.deps.git.removeWorktree(repo, path, true);
        await this.deps.git.deleteBranch(repo, branchName(name));
      }
    }
  }

  private async remove(worktree: Worktree): Promise<void> {
    await this.deps.git.removeWorktree(worktree.repo, worktree.path, true);
    await this.deps.git.deleteBranch(worktree.repo, worktree.branch);
  }
}
