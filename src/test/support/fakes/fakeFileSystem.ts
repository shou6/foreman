import type { FileSystem } from '../../../ports/fileSystem';

/** メモリ上のファイルシステム。パスは与えられたまま（区切りの正規化はしない） */
export class FakeFileSystem implements FileSystem {
  readonly files = new Map<string, string>();
  private readonly watchers = new Map<string, Set<(path: string) => void>>();
  /** 今までに始めた監視の数と、まだ動いている監視の数 */
  started = 0;
  active = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, content);
    }
  }

  async readFile(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  watch(dir: string, onChange: (path: string) => void): () => void {
    const set = this.watchers.get(dir) ?? new Set();
    set.add(onChange);
    this.watchers.set(dir, set);
    this.started++;
    this.active++;
    return () => {
      set.delete(onChange);
      this.active--;
    };
  }

  /** 監視に、与えたパスのまま知らせる（VS Code の監視がドライブ文字を小文字にして届けるのを再現する） */
  report(path: string): void {
    for (const set of this.watchers.values()) {
      for (const listener of set) {
        listener(path);
      }
    }
  }

  /** ファイルを外から変えたことにして、監視に知らせる */
  change(path: string, content: string | undefined): void {
    if (content === undefined) {
      this.files.delete(path);
    } else {
      this.files.set(path, content);
    }
    for (const [dir, set] of this.watchers) {
      if (path.startsWith(dir)) {
        for (const listener of set) {
          listener(path);
        }
      }
    }
  }
}
