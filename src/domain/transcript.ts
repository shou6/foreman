import type { RunnerEvent } from './events';

/**
 * タスク画面に出す会話の履歴の 1 項目。
 * 拡張機能側と Webview 側で同じ関数を使い、同じ形に組み立てる
 */
export type TranscriptItem =
  | { kind: 'prompt'; turn: number; text: string }
  | { kind: 'text'; turn: number; text: string }
  | {
      kind: 'tool';
      turn: number;
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: 'running' | 'ok' | 'error';
      output?: string;
    }
  | { kind: 'turn-end'; turn: number; ok: true }
  | { kind: 'turn-end'; turn: number; ok: false; interrupted: boolean; reason: string };

/** ターンの開始。ユーザーの指示を並べる */
export function startTurn(
  items: readonly TranscriptItem[],
  turn: number,
  prompt: string
): TranscriptItem[] {
  return [...items, { kind: 'prompt', turn, text: prompt }];
}

/** 指定のターンより後の項目を消す（会話の巻き戻し）。元の配列は変えない */
export function truncateAfter(
  items: readonly TranscriptItem[],
  afterTurn: number
): TranscriptItem[] {
  return items.filter((item) => item.turn <= afterTurn);
}

/** Runner のイベントを履歴に反映する。元の配列は変えない */
export function applyEvent(
  items: readonly TranscriptItem[],
  turn: number,
  event: RunnerEvent
): TranscriptItem[] {
  switch (event.type) {
    case 'text': {
      const last = items[items.length - 1];
      if (last?.kind === 'text' && last.turn === turn) {
        return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      }
      return [...items, { kind: 'text', turn, text: event.text }];
    }
    case 'tool-call':
      return [
        ...items,
        {
          kind: 'tool',
          turn,
          id: event.id,
          name: event.name,
          input: event.input,
          status: 'running',
        },
      ];
    case 'tool-result':
      return items.map((item) =>
        item.kind === 'tool' && item.id === event.id
          ? { ...item, status: event.ok ? 'ok' : 'error', output: event.output }
          : item
      );
    case 'turn-end':
      return [
        ...items,
        event.ok
          ? { kind: 'turn-end', turn, ok: true }
          : {
              kind: 'turn-end',
              turn,
              ok: false,
              interrupted: event.interrupted,
              reason: event.reason,
            },
      ];
    case 'init':
    case 'file-edit':
      return [...items];
  }
}
