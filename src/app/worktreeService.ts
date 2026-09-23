import type { Worktree } from '../domain/task';
import { branchName, worktreeName, worktreePath, WORKTREE_DIR } from '../domain/worktree';
import type { Git } from '../ports/git';

/** マージの結果。マージ自体は成功したが worktree を消せなかった時は removed が false */
export interface MergeResult {
  removed: boolean;
  reason?: string;
}

export interface WorktreeServiceDeps {
  git: Git;
  /** パスの区切り（Windows は \\） */
  sep: string;
  /** ブランチ名の接頭辞（設定）。省略時は foreman/ */
  branchPrefix?: () => string;
  /** dir の直下のフォルダ名。登録の無い worktree のフォルダを見つけるのに使う */
  listDirs?: (dir: string) => Promise<string[]>;
  removeDir?: (dir: string) => Promise<void>;
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
      branch: this.branch(name),
      base,
    };
    await this.deps.git.ensureExcluded(repo, WORKTREE_DIR.split('/')[0] + '/');
    await this.deps.git.addWorktree(repo, worktree.path, worktree.branch, base);
    return worktree;
  }

  /** 未マージの変更（未コミットの変更）があるか。フォルダが無ければ false */
  async hasChanges(worktree: Worktree): Promise<boolean> {
    try {
      return await this.deps.git.hasChanges(worktree.path);
    } catch {
      return false;
    }
  }

  /**
   * worktree の変更をコミットし、元のブランチへマージして、worktree とブランチを消す。
   * マージに失敗した時は何も消さない
   */
  async merge(worktree: Worktree, title: string): Promise<MergeResult> {
    await this.deps.git.commitAll(worktree.path, `foreman: ${title}`);
    await this.deps.git.merge(worktree.repo, worktree.branch, `Merge ${worktree.branch}: ${title}`);
    try {
      await this.remove(worktree);
      return { removed: true };
    } catch (error) {
      // マージは済んでいる。フォルダが掴まれている時などは、次の起動の後片付けに任せる
      return { removed: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** 変更ごと捨てる */
  discard(worktree: Worktree): Promise<void> {
    return this.remove(worktree);
  }

  /**
   * .foreman/worktrees の下にあって、どのタスクも使っていない worktree を消す。
   * 削除に失敗して git の登録だけ外れたフォルダも消し、登録を整理する
   */
  async cleanupOrphans(repo: string, inUse: readonly string[]): Promise<void> {
    const prefix = worktreePath(repo, '', this.deps.sep);
    const registered = new Set<string>();
    for (const path of await this.deps.git.listWorktrees(repo)) {
      registered.add(path);
      if (path.startsWith(prefix) && path !== repo && !inUse.includes(path)) {
        const name = path.slice(prefix.length);
        await this.deps.git.removeWorktree(repo, path, true);
        await this.deps.git.deleteBranch(repo, this.branch(name));
      }
    }
    if (this.deps.listDirs !== undefined && this.deps.removeDir !== undefined) {
      const dir = prefix.slice(0, -this.deps.sep.length);
      for (const name of await this.deps.listDirs(dir)) {
        const path = prefix + name;
        if (!inUse.includes(path) && !registered.has(path)) {
          await this.deps.removeDir(path);
        }
      }
    }
    await this.deps.git.prune(repo);
  }

  /** 設定の接頭辞を付けたブランチ名。接頭辞が空なら名前だけ、/ で終わらなければ足す */
  private branch(name: string): string {
    const prefix = this.deps.branchPrefix?.();
    if (prefix === undefined) {
      return branchName(name);
    }
    const trimmed = prefix.trim();
    return trimmed === '' ? name : (trimmed.endsWith('/') ? trimmed : trimmed + '/') + name;
  }

  /**
   * worktree とブランチを消す。worktree が既に無ければ登録を整理してブランチだけ消す。
   * フォルダを消せない時（掴まれている時など）は失敗にする
   */
  private async remove(worktree: Worktree): Promise<void> {
    const registered = (await this.deps.git.listWorktrees(worktree.repo)).includes(worktree.path);
    if (registered) {
      await this.deps.git.removeWorktree(worktree.repo, worktree.path, true);
    } else {
      await this.deps.git.prune(worktree.repo);
    }
    try {
      await this.deps.git.deleteBranch(worktree.repo, worktree.branch);
    } catch {
      // ブランチが既に無ければそのまま
    }
  }
}
