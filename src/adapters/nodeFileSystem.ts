import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileSystem } from '../ports/fileSystem';

/** Node の fs による実装。監視は fs.watch の recursive を使う */
export class NodeFileSystem implements FileSystem {
  async readFile(file: string): Promise<string | undefined> {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return undefined;
    }
  }

  async writeFile(file: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }

  async deleteFile(file: string): Promise<void> {
    await fs.rm(file, { force: true });
  }

  watch(dir: string, onChange: (file: string) => void): () => void {
    let watcher: fsSync.FSWatcher | undefined;
    try {
      // 実際のパスを監視する。Windows の短い名前（RUNNER~1 など）のままだと libuv が落ち、
      // macOS のシンボリックリンク（/var → /private/var）のままだと、知らせるファイル名がずれる。
      // 知らせるパスは、渡されたフォルダを基にする（呼び出し側のパスの形のまま比べられるように）
      const root = fsSync.realpathSync.native(dir);
      watcher = fsSync.watch(root, { recursive: true }, (_event, filename) => {
        if (filename === null || filename === undefined) {
          return;
        }
        const name = filename.toString();
        const full = path.join(dir, name);
        // フォルダの変更は知らせない（中のファイルの変更は別に届く）。消えたパスは判別できないので知らせる
        fsSync.stat(full, (error, stat) => {
          if (error === null && stat.isDirectory()) {
            return;
          }
          // macOS は監視しているフォルダ自体の変更を、そのフォルダの名前で知らせる。
          // 中に同じ名前のものが無ければ、それはフォルダ自体の知らせなので、消えたファイルとして扱わない
          if (error !== null && name === path.basename(root)) {
            return;
          }
          onChange(full);
        });
      });
      // 監視の失敗（フォルダの削除など）で拡張機能を落とさない
      watcher.on('error', () => {});
    } catch {
      watcher = undefined;
    }
    return () => watcher?.close();
  }
}
