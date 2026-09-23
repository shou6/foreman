/**
 * Git の操作（worktree の作成・削除・マージ）。実装は adapters/gitCli.ts、テストでは FakeGit。
 * Foreman が Git を使うのは worktree（Phase 2）だけで、差分カードは Git に依存しない
 */
export interface Git {
  /** dir が Git の作業ツリーの中なら、そのリポジトリのルート。違えば undefined */
  repoRoot(dir: string): Promise<string | undefined>;
  /** 今のブランチ名。detached なら undefined */
  currentBranch(repo: string): Promise<string | undefined>;
  /** base から branch を切り、path に worktree を作る */
  addWorktree(repo: string, path: string, branch: string, base: string): Promise<void>;
  /** worktree を消す。force なら未コミットの変更があっても消す */
  removeWorktree(repo: string, path: string, force: boolean): Promise<void>;
  deleteBranch(repo: string, branch: string): Promise<void>;
  /** 登録されている worktree のパスの一覧（メインの作業ツリーを含む） */
  listWorktrees(repo: string): Promise<string[]>;
  /** 未コミットの変更（追跡外を含む）があるか */
  hasChanges(dir: string): Promise<boolean>;
  /** すべての変更をステージしてコミットする。変更が無ければ何もしない */
  commitAll(dir: string, message: string): Promise<void>;
  /** repo の今のブランチへ branch をマージする（--no-ff）。衝突したら中止して失敗にする */
  merge(repo: string, branch: string, message: string): Promise<void>;
  /** paths（dir からの相対）のうち、Git が無視するもの。Git でない場所なら空 */
  ignored(dir: string, paths: readonly string[]): Promise<string[]>;
  /** .git/info/exclude に pattern を足す（既にあれば何もしない） */
  ensureExcluded(repo: string, pattern: string): Promise<void>;
}
