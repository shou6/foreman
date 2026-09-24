import type { BoardCard, BoardColumn, BoardColumnKey } from '../domain/board';

export type { BoardCard, BoardColumn, BoardColumnKey };

/** ボードに出す文字列。翻訳は拡張機能側で済ませて渡す */
export interface BoardStrings {
  columns: Record<BoardColumnKey, string>;
  /** あなたの番の列のカードに出す理由 */
  badges: Record<'approval' | 'question' | 'replied' | 'failed' | 'interrupted', string>;
  newDraft: string;
  start: string;
  stop: string;
  /** 承認や質問に答えるため、タスク画面を開く */
  open: string;
  /** 返答を待っているタスクを完了にする */
  markDone: string;
  /** レビュー待ちの変更を承認して完了にする */
  approveAndDone: string;
  /** {0} にファイル数 */
  files: string;
  /** 列が空の時 */
  empty: string;
  /** 完了の列が空の時（そこでできること） */
  emptyDone: string;
  /** {0} に分数 */
  minutes: string;
}

export interface BoardState {
  columns: BoardColumn[];
  strings: BoardStrings;
}

/** 拡張機能 → ボード */
export type ToBoard = { type: 'state'; state: BoardState };

/** ボード → 拡張機能。切り出す・編集・削除は右クリックのメニュー（コマンド）で行う */
export type FromBoard =
  | { type: 'ready' }
  | { type: 'open'; id: string }
  | { type: 'newDraft' }
  | { type: 'start'; id: string }
  | { type: 'approve'; id: string }
  | { type: 'stop'; id: string }
  /** 列をまたぐドロップ。許される移動だけ拡張機能が実行する */
  | { type: 'move'; id: string; to: BoardColumnKey }
  /** 同じ列の中での並べ替え。列の全カードの ID を新しい順で渡す */
  | { type: 'reorder'; column: BoardColumnKey; ids: string[] };
