import type { RunnerEvent } from '../domain/events';
import { applyEvent, startTurn, type TranscriptItem } from '../domain/transcript';
import type { TaskService } from './taskService';

/** 履歴に追加された分。Webview へそのまま送る */
export type TranscriptDelta =
  | { type: 'turn-start'; turn: number; prompt: string }
  | { type: 'event'; turn: number; event: RunnerEvent };

type AppendListener = (taskId: string, delta: TranscriptDelta) => void;

/**
 * タスクごとの表示用の履歴。TaskService のイベントから組み立てる。
 * M5 で永続化するまではメモリ上だけに持つ
 */
export class Transcripts {
  private readonly items = new Map<string, TranscriptItem[]>();
  private readonly listeners = new Set<AppendListener>();

  constructor(service: TaskService) {
    service.onDidChange((task) => {
      // ターンが増えていれば、その指示を履歴に足す
      const current = this.items.get(task.id) ?? [];
      const prompts = current.filter((item) => item.kind === 'prompt').length;
      let next = current;
      for (let turn = prompts; turn < task.turns.length; turn++) {
        const prompt = task.turns[turn]?.prompt ?? '';
        next = startTurn(next, turn, prompt);
        this.items.set(task.id, next);
        this.emit(task.id, { type: 'turn-start', turn, prompt });
      }
    });
    service.onDidReceiveEvent(({ taskId, turn, event }) => {
      this.items.set(taskId, applyEvent(this.items.get(taskId) ?? [], turn, event));
      this.emit(taskId, { type: 'event', turn, event });
    });
    service.onDidDelete((taskId) => {
      this.items.delete(taskId);
    });
  }

  get(taskId: string): TranscriptItem[] {
    return this.items.get(taskId) ?? [];
  }

  onDidAppend(listener: AppendListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(taskId: string, delta: TranscriptDelta): void {
    for (const listener of this.listeners) {
      listener(taskId, delta);
    }
  }
}
