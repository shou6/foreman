import type { RunnerEvent } from '../domain/events';
import { applyEvent, startTurn, truncateAfter, type TranscriptItem } from '../domain/transcript';
import type { TranscriptStore } from '../ports/transcriptStore';
import type { TaskService } from './taskService';

/** 履歴に追加された分。Webview へそのまま送り、保存先にも追記する */
export type TranscriptDelta =
  | { type: 'turn-start'; turn: number; prompt: string }
  | { type: 'event'; turn: number; event: RunnerEvent }
  /** 会話を戻した。afterTurn より後の項目を消す */
  | { type: 'truncate'; afterTurn: number };

type AppendListener = (taskId: string, delta: TranscriptDelta) => void;

/**
 * タスクごとの表示用の履歴。TaskService のイベントから組み立てる。
 * store を渡すと追記し、initial（起動時に読んだ分）から復元する
 */
export class Transcripts {
  private readonly items = new Map<string, TranscriptItem[]>();
  private readonly listeners = new Set<AppendListener>();

  constructor(
    service: TaskService,
    private readonly store?: TranscriptStore,
    initial?: Map<string, TranscriptDelta[]>
  ) {
    if (initial !== undefined) {
      for (const [taskId, deltas] of initial) {
        this.items.set(taskId, deltas.reduce<TranscriptItem[]>(apply, []));
      }
    }
    service.onDidChange((task) => {
      // ターンが減っていれば会話が戻されたので、履歴も切り詰める
      let current = this.items.get(task.id) ?? [];
      let prompts = current.filter((item) => item.kind === 'prompt').length;
      if (prompts > task.turns.length) {
        this.append(task.id, { type: 'truncate', afterTurn: task.turns.length - 1 });
        current = this.items.get(task.id) ?? [];
        prompts = current.filter((item) => item.kind === 'prompt').length;
      }
      // ターンが増えていれば、その指示を履歴に足す
      for (let turn = prompts; turn < task.turns.length; turn++) {
        this.append(task.id, { type: 'turn-start', turn, prompt: task.turns[turn]?.prompt ?? '' });
      }
    });
    service.onDidReceiveEvent(({ taskId, turn, event }) => {
      this.append(taskId, { type: 'event', turn, event });
    });
    service.onDidDelete((taskId) => {
      this.items.delete(taskId);
      void this.store?.delete(taskId);
    });
  }

  get(taskId: string): TranscriptItem[] {
    return this.items.get(taskId) ?? [];
  }

  onDidAppend(listener: AppendListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private append(taskId: string, delta: TranscriptDelta): void {
    this.items.set(taskId, apply(this.items.get(taskId) ?? [], delta));
    this.store?.append(taskId, delta);
    for (const listener of this.listeners) {
      listener(taskId, delta);
    }
  }
}

function apply(items: TranscriptItem[], delta: TranscriptDelta): TranscriptItem[] {
  switch (delta.type) {
    case 'turn-start':
      return startTurn(items, delta.turn, delta.prompt);
    case 'event':
      return applyEvent(items, delta.turn, delta.event);
    case 'truncate':
      return truncateAfter(items, delta.afterTurn);
  }
}
