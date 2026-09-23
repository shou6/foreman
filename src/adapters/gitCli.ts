import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Git } from '../ports/git';

/** git コマンドを起動する実装。git は PATH にあるものを使う */
export class GitCli implements Git {
  constructor(private readonly gitPath = 'git') {}

  async repoRoot(dir: string): Promise<string | undefined> {
    try {
      return path.normalize((await this.run(dir, 'rev-parse', '--show-toplevel')).trim());
    } catch {
      return undefined;
    }
  }

  async currentBranch(repo: string): Promise<string | undefined> {
    const name = (await this.run(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
    return name === 'HEAD' || name === '' ? undefined : name;
  }

  async addWorktree(repo: string, target: string, branch: string, base: string): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await this.run(repo, 'worktree', 'add', '-b', branch, target, base);
  }

  async removeWorktree(repo: string, target: string, force: boolean): Promise<void> {
    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    await this.run(repo, ...args, target);
  }

  async deleteBranch(repo: string, branch: string): Promise<void> {
    await this.run(repo, 'branch', '-D', branch);
  }

  async listWorktrees(repo: string): Promise<string[]> {
    const out = await this.run(repo, 'worktree', 'list', '--porcelain');
    return out
      .split(/\r?\n/)
      .filter((line) => line.startsWith('worktree '))
      .map((line) => path.normalize(line.slice('worktree '.length)));
  }

  async hasChanges(dir: string): Promise<boolean> {
    const out = await this.run(dir, 'status', '--porcelain', '--untracked-files=all');
    return out.trim() !== '';
  }

  async commitAll(dir: string, message: string): Promise<void> {
    if (!(await this.hasChanges(dir))) {
      return;
    }
    await this.run(dir, 'add', '-A');
    await this.run(dir, 'commit', '-q', '-m', message);
  }

  async merge(repo: string, branch: string, message: string): Promise<void> {
    try {
      await this.run(repo, 'merge', '--no-ff', '-m', message, branch);
    } catch (error) {
      // 衝突などで途中の状態が残らないよう、マージを中止してから知らせる
      try {
        await this.run(repo, 'merge', '--abort');
      } catch {
        // 中止するものが無ければそのまま
      }
      throw error;
    }
  }

  async ignored(dir: string, paths: readonly string[]): Promise<string[]> {
    if (paths.length === 0) {
      return [];
    }
    const result: string[] = [];
    // 引数の長さの上限を避けて、少しずつ問い合わせる。git には / 区切りで渡す
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      try {
        const out = await this.run(
          dir,
          'check-ignore',
          '--',
          ...chunk.map((p) => p.replace(/\\/g, '/'))
        );
        const hits = new Set(
          out
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l !== '')
        );
        for (const p of chunk) {
          if (hits.has(p) || hits.has(p.replace(/\\/g, '/'))) {
            result.push(p);
          }
        }
      } catch {
        // 終了コード 1 は「無視するものが無い」。Git でない場所のエラーも同じ扱い
      }
    }
    return result;
  }

  async showHead(dir: string, file: string): Promise<string | undefined> {
    try {
      // git show はフォルダだと一覧を返してしまうので、blob（ファイル）だけを読む
      return await this.run(dir, 'cat-file', 'blob', 'HEAD:' + file.replace(/\\/g, '/'));
    } catch {
      return undefined;
    }
  }

  async diff(dir: string): Promise<string> {
    return this.run(dir, 'diff', '--no-color', '--no-ext-diff');
  }

  async prune(repo: string): Promise<void> {
    await this.run(repo, 'worktree', 'prune');
  }

  async ensureExcluded(repo: string, pattern: string): Promise<void> {
    const file = path.join(repo, '.git', 'info', 'exclude');
    let current = '';
    try {
      current = await fs.readFile(file, 'utf8');
    } catch {
      await fs.mkdir(path.dirname(file), { recursive: true });
    }
    if (current.split(/\r?\n/).includes(pattern)) {
      return;
    }
    const prefix = current === '' || current.endsWith('\n') ? '' : '\n';
    await fs.appendFile(file, `${prefix}${pattern}\n`, 'utf8');
  }

  private run(cwd: string, ...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.gitPath,
        args,
        { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(`git ${args[0]} failed: ${(stderr || stdout || error.message).trim()}`)
            );
          } else {
            resolve(stdout);
          }
        }
      );
    });
  }
}
