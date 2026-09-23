import type { PendingRequest } from '../app/approvalService';
import type { TranscriptDelta } from '../app/transcripts';
import type { PermissionDecision } from '../domain/events';
import type { TaskStatus } from '../domain/task';
import type { TranscriptItem } from '../domain/transcript';

export type { PendingRequest, TranscriptDelta };

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
}

export interface PanelState {
  taskId: string;
  title: string;
  status: TaskStatus;
  model?: string;
  items: TranscriptItem[];
  /** 承認待ちの要求。無ければ undefined */
  pending?: PendingRequest;
  strings: PanelStrings;
}

/** 拡張機能 → Webview */
export type ToWebview =
  | { type: 'state'; state: PanelState }
  | { type: 'task'; status: TaskStatus; title: string; model?: string }
  | { type: 'pending'; pending: PendingRequest | undefined }
  | TranscriptDelta;

/** Webview → 拡張機能 */
export type ToExtension =
  | { type: 'ready' }
  | { type: 'send'; prompt: string }
  | { type: 'interrupt' }
  | { type: 'decision'; requestId: string; decision: PermissionDecision };
