import type { PendingRequest } from '../app/approvalService';
import type { TranscriptDelta } from '../app/transcripts';
import type { DiffLine } from '../domain/diff';
import type { PermissionDecision } from '../domain/events';
import type { FileChange, TaskStatus } from '../domain/task';
import type { TranscriptItem } from '../domain/transcript';

export type { DiffLine, FileChange, PendingRequest, TranscriptDelta };

/** 画面に出す文字列。翻訳は拡張機能側で済ませて渡す（Webview からは vscode.l10n を使えない） */
export interface PanelStrings {
  send: string;
  stop: string;
  running: string;
  allow: string;
  allowAlways: string;
  deny: string;
  denyReason: string;
  answer: string;
  waiting: string;
  changes: string;
  /** 差分カードの見出しの「n files」の files */
  files: string;
  openDiff: string;
  revert: string;
  reverted: string;
  unknownBefore: string;
  model: string;
  defaultModel: string;
  attachments: string;
  remove: string;
  dropHint: string;
  /** 状態の表示名 */
  statusLabels: Record<TaskStatus, string>;
  worktree: string;
  /** {0} に元のブランチが入る */
  merge: string;
  discard: string;
  /** {0} に件数が入る */
  toolCalls: string;
  export: string;
  merging: string;
  discarding: string;
}

export interface PanelState {
  taskId: string;
  title: string;
  status: TaskStatus;
  /** タスクに指定したモデル。無ければ Claude Code の既定 */
  model?: string;
  /** SDK が報告した、実際に動いているモデル */
  activeModel?: string;
  /** モデルの選択肢 */
  models: string[];
  items: TranscriptItem[];
  /** 承認待ちの要求。無ければ undefined */
  pending?: PendingRequest;
  /** ターンの番号 → そのターンの変更 */
  changes: Record<number, FileChange[]>;
  /** "<turn>:<path>" → インライン差分の行 */
  diffs: Record<string, DiffLine[]>;
  /** 次の指示に添付するファイル（絶対パス） */
  attachments: string[];
  /** 本文の最大の幅（em）。0 なら画面いっぱい */
  maxWidthEm: number;
  /** タスクが使う worktree。無ければ undefined */
  worktree?: { branch: string; base: string };
  /** ツールの呼び出しを最初から開いて見せるか（設定 foreman.toolCalls） */
  toolCallsExpanded: boolean;
  /** worktree のマージ・破棄の処理中 */
  finishing?: 'merge' | 'discard';
  strings: PanelStrings;
}

/** 拡張機能 → Webview */
export type ToWebview =
  | { type: 'state'; state: PanelState }
  | {
      type: 'task';
      status: TaskStatus;
      title: string;
      model?: string;
      activeModel?: string;
      worktree?: { branch: string; base: string };
    }
  | { type: 'pending'; pending: PendingRequest | undefined }
  | { type: 'changes'; turn: number; changes: FileChange[] }
  | { type: 'diff'; turn: number; path: string; lines: DiffLine[] }
  | { type: 'attachments'; paths: string[] }
  | { type: 'finishing'; kind: 'merge' | 'discard' | undefined }
  | TranscriptDelta;

/** Webview → 拡張機能 */
export type ToExtension =
  | { type: 'ready' }
  | { type: 'send'; prompt: string; attachments: string[] }
  | { type: 'interrupt' }
  | { type: 'decision'; requestId: string; decision: PermissionDecision }
  | { type: 'showDiff'; turn: number; path: string }
  | { type: 'openDiff'; turn: number; path: string }
  | { type: 'revert'; turn: number; path: string }
  | { type: 'setModel'; model: string | undefined }
  /** エクスプローラーやタブからドロップされた URI（text/uri-list） */
  | { type: 'dropped'; uris: string[] }
  | { type: 'removeAttachment'; path: string }
  /** worktree の変更を元のブランチへマージする / 捨てる */
  | { type: 'merge' }
  | { type: 'discard' }
  /** タスクを Markdown に書き出す */
  | { type: 'export' };

export function diffKey(turn: number, path: string): string {
  return `${turn}:${path}`;
}
