import type { Git } from '../../../ports/git';

/** メモリ上の Git。呼び出しを記録し、worktree とブランチの有無だけを追う */
export class FakeGit implements Git {
  readonly repos = new Map<
    string,
    { branch: string; worktrees: Set<string>; branches: Set<string> }
  >();
  readonly calls: string[] = [];
  /** dir → 未コミットの変更があるか */
  readonly dirty = new Map<string, boolean>();
  readonly excluded = new Map<string, string[]>();
  readonly commits: { dir: string; message: string }[] = [];
  readonly merges: { repo: string; branch: string; message: string }[] = [];
  /** merge を失敗させたい時に設定する */
  mergeError: string | undefined;

  constructor(repo?: string, branch = 'main') {
    if (repo !== undefined) {
      this.addRepo(repo, branch);
    }
  }

  addRepo(repo: string, branch = 'main'): void {
    this.repos.set(repo, { branch, worktrees: new Set([repo]), branches: new Set([branch]) });
  }

  private repoOf(dir: string): string | undefined {
    for (const repo of this.repos.keys()) {
      if (dir === repo || dir.startsWith(repo + '\\') || dir.startsWith(repo + '/')) {
        return repo;
      }
    }
    return undefined;
  }

  async repoRoot(dir: string): Promise<string | undefined> {
    this.calls.push(`repoRoot ${dir}`);
    return this.repoOf(dir);
  }

  async currentBranch(repo: string): Promise<string | undefined> {
    return this.repos.get(repo)?.branch;
  }

  async addWorktree(repo: string, path: string, branch: string, base: string): Promise<void> {
    this.calls.push(`addWorktree ${path} ${branch} ${base}`);
    const r = this.repos.get(repo);
    if (r === undefined) {
      throw new Error('not a repo: ' + repo);
    }
    if (r.branches.has(branch)) {
      throw new Error('branch exists: ' + branch);
    }
    r.branches.add(branch);
    r.worktrees.add(path);
  }

  async removeWorktree(repo: string, path: string, force: boolean): Promise<void> {
    this.calls.push(`removeWorktree ${path} ${force ? 'force' : ''}`.trim());
    const r = this.repos.get(repo);
    if (r === undefined) {
      throw new Error('not a repo: ' + repo);
    }
    if (!force && (this.dirty.get(path) ?? false)) {
      throw new Error('worktree has changes: ' + path);
    }
    r.worktrees.delete(path);
    this.dirty.delete(path);
  }

  async deleteBranch(repo: string, branch: string): Promise<void> {
    this.calls.push(`deleteBranch ${branch}`);
    this.repos.get(repo)?.branches.delete(branch);
  }

  async listWorktrees(repo: string): Promise<string[]> {
    return [...(this.repos.get(repo)?.worktrees ?? [])];
  }

  async hasChanges(dir: string): Promise<boolean> {
    return this.dirty.get(dir) ?? false;
  }

  async commitAll(dir: string, message: string): Promise<void> {
    this.calls.push(`commitAll ${dir}`);
    if (this.dirty.get(dir) ?? false) {
      this.commits.push({ dir, message });
      this.dirty.set(dir, false);
    }
  }

  async merge(repo: string, branch: string, message: string): Promise<void> {
    this.calls.push(`merge ${branch}`);
    if (this.mergeError !== undefined) {
      throw new Error(this.mergeError);
    }
    this.merges.push({ repo, branch, message });
  }

  /** 無視するパス。テストで設定する */
  ignoredPaths: string[] = [];

  async ignored(_dir: string, paths: readonly string[]): Promise<string[]> {
    return paths.filter((p) => this.ignoredPaths.includes(p));
  }

  async ensureExcluded(repo: string, pattern: string): Promise<void> {
    const list = this.excluded.get(repo) ?? [];
    if (!list.includes(pattern)) {
      list.push(pattern);
    }
    this.excluded.set(repo, list);
  }
}
