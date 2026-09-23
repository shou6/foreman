import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { SnapshotStore } from '../ports/snapshotStore';

/** スナップショットを <dir>/<sha256> に保存する。同じ内容は 1 つだけ持つ（NFR-4） */
export class FsSnapshotStore implements SnapshotStore {
  constructor(private readonly dir: string) {}

  async save(content: string): Promise<string> {
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    const file = path.join(this.dir, hash);
    try {
      await fs.access(file);
      return hash;
    } catch {
      // 無ければ書く
    }
    await fs.mkdir(this.dir, { recursive: true });
    // 途中で落ちても壊れたファイルが残らないよう、一時ファイルに書いてから rename する
    const temp = file + '.' + process.pid + '.tmp';
    await fs.writeFile(temp, content, 'utf8');
    try {
      await fs.rename(temp, file);
    } catch (error) {
      // 同じ内容を同時に書いた時は、既にあるものを使う
      await fs.rm(temp, { force: true });
      try {
        await fs.access(file);
      } catch {
        throw error;
      }
    }
    return hash;
  }

  async load(hash: string): Promise<string | undefined> {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      return undefined;
    }
    try {
      return await fs.readFile(path.join(this.dir, hash), 'utf8');
    } catch {
      return undefined;
    }
  }
}
