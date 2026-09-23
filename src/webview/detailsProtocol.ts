import type { FileChange, TaskStatus } from '../domain/task';

/** 右サイドバーに出す文字列。翻訳は拡張機能側で済ませて渡す */
export interface DetailsStrings {
  noTask: string;
  changes: string;
  checkpoints: string;
  /** {0} にターンの番号（1 始まり） */
  turn: string;
  openDiff: string;
  revert: string;
  reverted: string;
  rewindHere: string;
  forkHere: string;
  noChanges: string;
  statusLabels: Record<TaskStatus, string>;
}

export interface DetailsChange {
  path: string;
  kind: FileChange['kind'];
  added?: number;
  removed?: number;
  reverted: boolean;
}

export interface DetailsTurn {
  index: number;
  prompt: string;
  /** 正常に終わったターンだけがチェックポイントになる。未終了は undefined */
  ok?: boolean;
  changes: DetailsChange[];
}

export interface DetailsTask {
  id: string;
  title: string;
  status: TaskStatus;
  turns: DetailsTurn[];
}

export interface DetailsState {
  /** 今見ているタスク。無ければ undefined */
  task: DetailsTask | undefined;
  strings: DetailsStrings;
}

/** 拡張機能 → 右サイドバー */
export type ToDetails = { type: 'state'; state: DetailsState };

/** 右サイドバー → 拡張機能 */
export type FromDetails =
  | { type: 'ready' }
  /** タスク画面を前面に出す */
  | { type: 'open' }
  | { type: 'openDiff'; turn: number; path: string }
  | { type: 'revert'; turn: number; path: string }
  | { type: 'rewind'; turn: number }
  | { type: 'fork'; turn: number };
