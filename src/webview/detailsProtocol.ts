import type { StatusKind } from '../domain/status';
import type { FileChange, TaskStatus } from '../domain/task';

/** 右サイドバーに出す文字列。翻訳は拡張機能側で済ませて渡す */
export interface DetailsStrings {
  noTask: string;
  /** {0} にターンの番号（1 始まり） */
  turn: string;
  openDiff: string;
  revert: string;
  reverted: string;
  rewindHere: string;
  forkHere: string;
  /** 変更の無いターン */
  noChanges: string;
  /** タスク全体で変更が無い時の、見出しの横 */
  none: string;
  statusLabels: Record<StatusKind, string>;
  changesTitle: string;
  /** 仕上げ（worktree のマージ・破棄・全体の差分） */
  finish: string;
  allDiff: string;
  /** {0} に元のブランチ */
  merge: string;
  discardWorktree: string;
  /** 仕上げの手順。{0} にターン数、{1} にファイル数 */
  stepApproved: string;
  stepApprove: string;
  stepReview: string;
  /** {0} に元のブランチ */
  stepMerge: string;
  /** 破棄の段の見出し（変更がある時・無い時） */
  endWithoutMerge: string;
  endWithoutChanges: string;
  nothingToMerge: string;
  nothingToMergeHint: string;
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
  /** 状態の呼び名（サイドバーと同じ） */
  kind: StatusKind;
  turnOpen: boolean;
  turns: DetailsTurn[];
  worktree?: { branch: string; base: string };
  /** 承認済みで変更があり、マージできる */
  mergeable: boolean;
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
  | { type: 'fork'; turn: number }
  /** 全ターンの変更をまとめて差分エディタで開く */
  | { type: 'allDiff' }
  | { type: 'merge' }
  /** worktree を捨てる（確認は拡張機能側で出す） */
  | { type: 'discard' };
