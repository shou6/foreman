import * as fs from 'fs/promises';
import * as path from 'path';
import type { TranscriptDelta } from '../app/transcripts';
import type { TranscriptStore } from '../ports/transcriptStore';

/**
 * 表示用の履歴を <dir>/<id>.jsonl に追記する。
 * 出力は 1 文字ずつ届くので、書き込みは順番を保ったまま非同期にまとめる
 */
export class FsTranscriptStore implements TranscriptStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {}

  append(taskId: string, delta: TranscriptDelta): void {
    const line = JSON.stringify(delta) + '\n';
    this.queue = this.queue
      .then(async () => {
        await fs.mkdir(this.dir, { recursive: true });
        await fs.appendFile(this.file(taskId), line, 'utf8');
      })
      .catch(() => {
        // 書けなくても表示は続ける。次回の起動で履歴が欠けるだけ
      });
  }

  /** 溜まっている書き込みが終わるのを待つ（終了時とテスト用） */
  flush(): Promise<void> {
    return this.queue;
  }

  async loadAll(): Promise<Map<string, TranscriptDelta[]>> {
    const all = new Map<string, TranscriptDelta[]>();
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return all;
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) {
        continue;
      }
      const taskId = name.slice(0, -'.jsonl'.length);
      const text = await fs.readFile(path.join(this.dir, name), 'utf8');
      const deltas: TranscriptDelta[] = [];
      for (const line of text.split('\n')) {
        if (line.trim() === '') {
          continue;
        }
        try {
          deltas.push(JSON.parse(line) as TranscriptDelta);
        } catch {
          // 途中で落ちた時などの壊れた行は飛ばす
        }
      }
      all.set(taskId, deltas);
    }
    return all;
  }

  async delete(taskId: string): Promise<void> {
    await this.queue;
    await fs.rm(this.file(taskId), { force: true });
  }

  private file(taskId: string): string {
    return path.join(this.dir, taskId + '.jsonl');
  }
}
