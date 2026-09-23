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
      watcher = fsSync.watch(dir, { recursive: true }, (_event, filename) => {
        if (filename === null || filename === undefined) {
          return;
        }
        const full = path.join(dir, filename.toString());
        // フォルダの変更は知らせない（中のファイルの変更は別に届く）。消えたパスは判別できないので知らせる
        fsSync.stat(full, (error, stat) => {
          if (error === null && stat.isDirectory()) {
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
