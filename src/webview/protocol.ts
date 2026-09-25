import type { PendingRequest } from '../app/approvalService';
import type { Attachment } from '../domain/attachments';
import type { ContextUsage, TurnTokens } from '../domain/usage';
import type { Preset } from '../domain/presets';
import type { TranscriptDelta } from '../app/transcripts';
import type { DiffLine } from '../domain/diff';
import type { PermissionDecision } from '../domain/events';
import type { ModelOption } from '../domain/models';
import type { SlashCommandInfo } from '../domain/slashCommands';
import type { ApprovalKind, StatusKind } from '../domain/status';
import type { EffortLevel, FileChange, PermissionMode, TaskStatus } from '../domain/task';
import type { TranscriptItem } from '../domain/transcript';

export type { Attachment, DiffLine, FileChange, PendingRequest, Preset, TranscriptDelta };

/** 画面に出す文字列。翻訳は拡張機能側で済ませて渡す（Webview からは vscode.l10n を使えない） */
export interface PanelStrings {
  send: string;
  stop: string;
  /** 実行中の区切り行。{0} にターンの番号（1 始まり）、{1} に経過 */
  runningTurn: string;
  /** 経過の表し方。{0} に秒 / {0} に分、{1} に秒 */
  elapsedSeconds: string;
  elapsedMinutes: string;
  allow: string;
  /** 「常に許可」。後ろに許可する範囲を添える */
  allowAlways: string;
  /** 「常に許可」で許可する範囲（ボタンの並びの下に出す）。{0} に範囲 */
  alwaysScope: string;
  /** 拒否…（押すと理由の欄が開く）と、理由を書いた後の拒否 */
  deny: string;
  denyConfirm: string;
  denyReason: string;
  /** 承認カードの問いかけ。other の {0} にツール名 */
  approvalTitles: Record<ApprovalKind, string>;
  inputDetails: string;
  answer: string;
  /** 質問の「その他」と、その入力欄の案内 */
  other: string;
  otherPlaceholder: string;
  /** 計画の承認カードの「承認して実装」、入力欄の「計画だけ」のトグルとその説明 */
  approvePlan: string;
  /** 計画をエディターの別のタブで開く */
  openPlan: string;
  /** 右サイドバーのセッションの区画を開くリンク */
  showSession: string;
  planMode: string;
  planModeHint: string;
  /** {0} に最後の番号（質問が 1 つの時 / タブで切り替える時） */
  questionKeys: string;
  questionTabKeys: string;
  /** 質問のタブの最後（答えの確認と送信）、次の質問へ、答えていない質問 */
  submitTab: string;
  next: string;
  unanswered: string;
  waiting: string;
  /** 差分カードの見出し。{0} にターンの番号（1 始まり） */
  changesInTurn: string;
  /** 差分カードの見出しの「n files」の files */
  files: string;
  openDiff: string;
  revert: string;
  reverted: string;
  /** 変更前が不明（戻せない）ファイル */
  unknownBefore: string;
  model: string;
  defaultModel: string;
  /** 推奨モデルが分かる時の「既定」。{0} にモデルの名前 */
  defaultModelWith: string;
  /** Effort のスライダー（名前と、各段階の名前） */
  effort: string;
  effortLabels: Record<EffortLevel, string>;
  /** {0} に前のターンで動いたモデル */
  previousModel: string;
  attachments: string;
  remove: string;
  /** 入力欄の案内（プリセットが無い時 / ある時）と、実行中の案内 */
  promptHint: string;
  promptHintPresets: string;
  draftHint: string;
  /** ドラッグ中に入力欄の枠に出す案内 */
  dropHint: string;
  /** 「渡すもの」のボタン */
  selection: string;
  diagnostics: string;
  gitDiff: string;
  addFile: string;
  /** 状態の呼び名の表示名 */
  statusLabels: Record<StatusKind, string>;
  worktree: string;
  /** {0} に元のブランチが入る */
  merge: string;
  merging: string;
  /** {0} に件数が入る */
  toolCalls: string;
  /** 考えている途中の見出し（動いている間 / 終わった後） */
  thinking: string;
  thought: string;
  /** 圧縮のボタンと、圧縮した区切り（{0} 前、{1} 後のトークン数）。/ の候補のうちコマンドの見出し */
  compact: string;
  compacted: string;
  commandsHint: string;
  /** 候補の下の案内。{0} に出していない件数 */
  moreCandidates: string;
  /** 見出しの「…」（ほかの操作） */
  more: string;
  /** 題名を押した時の説明（名前の変更） */
  rename: string;
  /** Context パネル（次に Claude へ送る内容）の見出しと、空の時の案内 */
  contextPanel: string;
  contextEmpty: string;
  permissionMode: string;
  alwaysAllowedList: string;
  directory: string;
  /** Context パネルの要約の添付数。{0} に件数 */
  noAttachments: string;
  attachmentCount: string;
  /** チェックポイントの行。{0} にターンの番号（1 始まり）が入る */
  turn: string;
  /** チェックポイントの操作（短い名前と、説明） */
  rewind: string;
  fork: string;
  rewindHere: string;
  forkHere: string;
  /** レビュー待ちの変更を承認して完了にする */
  approveAndDone: string;
  /** 完了したタスクの差分カードの印と、承認の取り消し */
  approved: string;
  unapprove: string;
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
  /** 最後のターンの開始（ISO）。実行中の経過に使う */
  turnStartedAt?: string;
  /** worktree をマージできる（承認済みで、戻していない変更がある） */
  mergeable: boolean;
  /** 承認を取り消せる（承認で完了にし、まだマージ・破棄していない）。無ければ false */
  unapprovable?: boolean;
  /** コンテキストの使用量。結果のあるターンが無ければ undefined */
  usage?: ContextUsage;
  /** ターンの番号 → そのターンのトークン数 */
  tokens?: Record<number, TurnTokens>;
  /** タスクに指定したモデル。無ければ Claude Code の既定 */
  model?: string;
  /** SDK が報告した、実際に動いているモデル */
  activeModel?: string;
  /** 指定した Effort。無ければ Claude Code に従う */
  effort?: EffortLevel;
  /** セッションが実際に使う Effort。分からなければ undefined */
  activeEffort?: EffortLevel;
  /** 承認方式。plan なら入力欄の「計画だけ」が入になる */
  permissionMode?: PermissionMode;
  /** モデルの選択肢（Claude Code から取得。取得前は固定の一覧） */
  models: ModelOption[];
  /** 既定（モデルを指定しない時）の中身。分からなければ undefined */
  defaultModel?: ModelOption;
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
  /** 考えている途中の出し方（設定 foreman.thinking）。無ければたたんで出す */
  thinking?: 'collapsed' | 'hidden';
  /** 指示のプリセット（設定 foreman.presets） */
  presets: Preset[];
  /** Claude Code のスラッシュコマンドとスキル（取得できた時だけ） */
  commands?: SlashCommandInfo[];
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
      turnStartedAt?: string;
      mergeable: boolean;
      unapprovable?: boolean;
      usage?: ContextUsage;
      tokens?: Record<number, TurnTokens>;
      title: string;
      model?: string;
      activeModel?: string;
      effort?: EffortLevel;
      activeEffort?: EffortLevel;
      permissionMode?: PermissionMode;
      worktree?: { branch: string; base: string };
    }
  | { type: 'pending'; pending: PendingRequest | undefined }
  | { type: 'changes'; turn: number; changes: FileChange[] }
  | { type: 'diff'; turn: number; path: string; lines: DiffLine[] }
  | { type: 'attachments'; attachments: Attachment[] }
  | { type: 'finishing'; kind: 'merge' | 'discard' | undefined }
  /** モデルの一覧を取得し終えた */
  | { type: 'models'; models: ModelOption[]; defaultModel: ModelOption | undefined }
  /** Claude Code のコマンドとスキルの一覧を取得し終えた */
  | { type: 'commands'; commands: SlashCommandInfo[] }
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
  /** 次のターンから使う Effort。undefined で Claude Code に従う */
  | { type: 'setEffort'; effort: EffortLevel | undefined }
  /** 承認方式を変える（「計画だけ」の切り替え） */
  | { type: 'setPermissionMode'; mode: PermissionMode }
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
  /** 見出しの「…」。ほかの操作（名前の変更・書き出し・切り出し・削除）を選ぶ */
  | { type: 'more' }
  /** コンテキストを圧縮する */
  | { type: 'compact' }
  /** 計画（ExitPlanMode）をエディターで開く */
  | { type: 'openPlan'; plan: string }
  /** 右サイドバーのセッションの区画を前面に出す */
  | { type: 'showSession' }
  /** タスク名の変更（入力は拡張機能側のダイアログ） */
  | { type: 'rename' }
  /** 指定のターンの直後に戻す（ファイル、または会話も）。FR-DIFF-8 */
  | { type: 'rewind'; turn: number }
  /** 指定のターンの直後から新しいタスクを切り出す。FR-TASK-12 */
  | { type: 'fork'; turn: number }
  /** レビュー待ちの変更を確認済みにする（完了にする）。マージはしない */
  | { type: 'approve' }
  /** 承認を取り消し、承認の前の状態に戻す */
  | { type: 'unapprove' }
  /** ターンの変更をすべて戻す */
  | { type: 'revertAll'; turn: number };

export function diffKey(turn: number, path: string): string {
  return `${turn}:${path}`;
}
