import { createHash } from 'crypto';
import type { SnapshotStore } from '../../../ports/snapshotStore';

/** メモリ上のスナップショット。ハッシュは実装と同じ sha256 */
export class InMemorySnapshotStore implements SnapshotStore {
  readonly contents = new Map<string, string>();

  async save(content: string): Promise<string> {
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    this.contents.set(hash, content);
    return hash;
  }

  async load(hash: string): Promise<string | undefined> {
    return this.contents.get(hash);
  }
}
