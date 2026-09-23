import type { BoardCard, BoardColumn, BoardColumnKey } from '../domain/board';

export type { BoardCard, BoardColumn, BoardColumnKey };

/** ボードに出す文字列。翻訳は拡張機能側で済ませて渡す */
export interface BoardStrings {
  columns: Record<BoardColumnKey, string>;
  badges: Record<'failed' | 'interrupted', string>;
  newDraft: string;
  start: string;
  approve: string;
  stop: string;
  edit: string;
  fork: string;
  delete: string;
  /** 「n files」の files */
  files: string;
  /** 列が空の時 */
  empty: string;
}

export interface BoardState {
  columns: BoardColumn[];
  strings: BoardStrings;
}

/** 拡張機能 → ボード */
export type ToBoard = { type: 'state'; state: BoardState };

/** ボード → 拡張機能 */
export type FromBoard =
  | { type: 'ready' }
  | { type: 'open'; id: string }
  | { type: 'newDraft' }
  | { type: 'start'; id: string }
  | { type: 'approve'; id: string }
  | { type: 'stop'; id: string }
  | { type: 'edit'; id: string }
  | { type: 'fork'; id: string }
  | { type: 'delete'; id: string }
  /** 列をまたぐドロップ。許される移動だけ拡張機能が実行する */
  | { type: 'move'; id: string; to: BoardColumnKey }
  /** 同じ列の中での並べ替え。列の全カードの ID を新しい順で渡す */
  | { type: 'reorder'; column: BoardColumnKey; ids: string[] };
