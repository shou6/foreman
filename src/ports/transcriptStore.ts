import type { TranscriptDelta } from '../app/transcripts';

/**
 * 表示用の履歴の保存。追記だけを行い、起動時にまとめて読む。
 * 実装は adapters/fsTranscriptStore.ts、テストでは InMemoryTranscriptStore
 */
export interface TranscriptStore {
  append(taskId: string, delta: TranscriptDelta): void;
  loadAll(): Promise<Map<string, TranscriptDelta[]>>;
  delete(taskId: string): Promise<void>;
}
