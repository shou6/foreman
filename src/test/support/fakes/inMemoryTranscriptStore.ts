import type { TranscriptDelta } from '../../../app/transcripts';
import type { TranscriptStore } from '../../../ports/transcriptStore';

export class InMemoryTranscriptStore implements TranscriptStore {
  readonly deltas = new Map<string, TranscriptDelta[]>();

  constructor(initial: Record<string, TranscriptDelta[]> = {}) {
    for (const [id, list] of Object.entries(initial)) {
      this.deltas.set(id, [...list]);
    }
  }

  append(taskId: string, delta: TranscriptDelta): void {
    const list = this.deltas.get(taskId) ?? [];
    list.push(delta);
    this.deltas.set(taskId, list);
  }

  async loadAll(): Promise<Map<string, TranscriptDelta[]>> {
    return new Map([...this.deltas].map(([id, list]) => [id, [...list]]));
  }

  async delete(taskId: string): Promise<void> {
    this.deltas.delete(taskId);
  }
}
