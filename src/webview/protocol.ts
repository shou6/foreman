import type { PendingRequest } from '../app/approvalService';
import type { Attachment } from '../domain/attachments';
import type { ContextUsage, TurnTokens } from '../domain/usage';
import type { Preset } from '../domain/presets';
import type { TranscriptDelta } from '../app/transcripts';
import type { DiffLine } from '../domain/diff';
import type { PermissionDecision } from '../domain/events';
import type { FileChange, TaskStatus } from '../domain/task';
import type { TranscriptItem } from '../domain/transcript';

export type { Attachment, DiffLine, FileChange, PendingRequest, Preset, TranscriptDelta };

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
  /** 「渡すもの」の行の見出しとボタン */
  pass: string;
  selection: string;
  diagnostics: string;
  gitDiff: string;
  addFile: string;
  /** 状態の表示名 */
  statusLabels: Record<TaskStatus, string>;
  worktree: string;
  /** {0} に元のブランチが入る */
  merge: string;
  discard: string;
  /** {0} に件数が入る */
  toolCalls: string;
  export: string;
  /** 題名を押した時の説明（名前の変更） */
  rename: string;
  /** Context パネル（次に Claude へ送る内容）の見出しと、空の時の案内 */
  contextPanel: string;
  contextEmpty: string;
  /** {0} にプリセットの名前の並び */
  presetsHint: string;
  permissionMode: string;
  alwaysAllowedList: string;
  directory: string;
  merging: string;
  discarding: string;
  /** 「常に許可」で許可する内容の見出し */
  alwaysScope: string;
  /** チェックポイントの行。{0} にターンの番号（1 始まり）が入る */
  turn: string;
  rewindHere: string;
  forkHere: string;
  /** レビュー待ちの変更を確認済みにする */
  approve: string;
  /** 返答を待っているタスクを完了にする */
  markDone: string;
  /** ターンの変更をすべて戻す */
  revertAll: string;
  /** コンテキストのメーターの見出し */
  contextUsage: string;
}

export interface PanelState {
  taskId: string;
  title: string;
  status: TaskStatus;
  /** Claude が動いている（最後のターンが終わっていない）。waiting でも終わっていれば false */
  turnOpen: boolean;
  /** worktree をマージできる（承認済みで、戻していない変更がある） */
  mergeable: boolean;
  /** コンテキストの使用量。結果のあるターンが無ければ undefined */
  usage?: ContextUsage;
  /** ターンの番号 → そのターンのトークン数 */
  tokens?: Record<number, TurnTokens>;
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
  /** 次の指示に添えるもの */
  attachments: Attachment[];
  /** 本文の最大の幅（em）。0 なら画面いっぱい */
  maxWidthEm: number;
  /** タスクが使う worktree。無ければ undefined */
  worktree?: { branch: string; base: string };
  /** ツールの呼び出しを最初から開いて見せるか（設定 foreman.toolCalls） */
  toolCallsExpanded: boolean;
  /** 指示のプリセット（設定 foreman.presets） */
  presets: Preset[];
  /** セッションの情報（Context パネルに出す） */
  context: { cwd: string; permissionMode: string; alwaysAllowed: string[] };
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
      turnOpen: boolean;
      mergeable: boolean;
      usage?: ContextUsage;
      tokens?: Record<number, TurnTokens>;
      title: string;
      model?: string;
      activeModel?: string;
      worktree?: { branch: string; base: string };
    }
  | { type: 'pending'; pending: PendingRequest | undefined }
  | { type: 'changes'; turn: number; changes: FileChange[] }
  | { type: 'diff'; turn: number; path: string; lines: DiffLine[] }
  | { type: 'attachments'; attachments: Attachment[] }
  | { type: 'finishing'; kind: 'merge' | 'discard' | undefined }
  | TranscriptDelta;

/** Webview → 拡張機能 */
export type ToExtension =
  | { type: 'ready' }
  | { type: 'send'; prompt: string; attachments: Attachment[] }
  | { type: 'interrupt' }
  | { type: 'decision'; requestId: string; decision: PermissionDecision }
  | { type: 'showDiff'; turn: number; path: string }
  | { type: 'openDiff'; turn: number; path: string }
  | { type: 'revert'; turn: number; path: string }
  | { type: 'setModel'; model: string | undefined }
  /** エクスプローラーやタブからドロップされた URI（text/uri-list） */
  | { type: 'dropped'; uris: string[] }
  /** クリップボードから貼り付けた画像（base64）。拡張機能が保存してファイルとして添付する */
  | { type: 'pasteImage'; mime: string; data: string }
  | { type: 'removeAttachment'; key: string }
  /** 「渡すもの」: エディタの選択範囲、診断、git diff、ファイルの選択 */
  | { type: 'attachSelection' }
  | { type: 'attachDiagnostics' }
  | { type: 'attachGitDiff' }
  | { type: 'pickFiles' }
  /** worktree の変更を元のブランチへマージする / 捨てる */
  | { type: 'merge' }
  | { type: 'discard' }
  /** タスクを Markdown に書き出す */
  | { type: 'export' }
  /** タスク名の変更（入力は拡張機能側のダイアログ） */
  | { type: 'rename' }
  /** 指定のターンの直後に戻す（ファイル、または会話も）。FR-DIFF-8 */
  | { type: 'rewind'; turn: number }
  /** 指定のターンの直後から新しいタスクを切り出す。FR-TASK-12 */
  | { type: 'fork'; turn: number }
  /** レビュー待ちの変更を確認済みにする（完了にする）。マージはしない */
  | { type: 'approve' }
  /** ターンの変更をすべて戻す */
  | { type: 'revertAll'; turn: number };

export function diffKey(turn: number, path: string): string {
  return `${turn}:${path}`;
}
