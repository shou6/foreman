import type { EffortLevel, Usage } from './task';

/**
 * AgentRunner から届くイベント。SDK のメッセージを表示と状態管理に必要な形へ正規化したもの。
 * SDK の型はここに出さない（adapters/agentSdkRunner.ts に閉じる）
 */
export type RunnerEvent =
  /** セッションの初期化。モデルの切り替え後にも再送される */
  | { type: 'init'; sessionId: string; model: string }
  /** Claude の出力の断片（ストリーミング） */
  | { type: 'text'; text: string }
  /** 考えている途中の断片（extended thinking）。見せない設定でも届く */
  | { type: 'thinking'; text: string }
  /**
   * 確定した出力。streamed は、前回の確定からこれまでに text で流した文字数。
   * その分を text に置き換える（API の再試行で断片が重なった時の修正）
   */
  | { type: 'text-final'; text: string; streamed: number }
  /** ツールの呼び出し */
  | { type: 'tool-call'; id: string; name: string; input: Record<string, unknown> }
  /** ツールの結果 */
  | { type: 'tool-result'; id: string; ok: boolean; output: string }
  /**
   * セッションが次に使う Effort（指定しない時のモデルの既定や /effort の保存値を含む）。
   * 起動した後と、モデルや Effort を変えた後に届く。対応していないモデルなら undefined
   */
  | { type: 'effort'; effort: EffortLevel | undefined }
  /** コンテキストを圧縮した（/compact、または自動）。前後のトークン数 */
  | { type: 'compact'; preTokens: number; postTokens: number | undefined }
  /** 編集ツールの直前・直後（差分カードの材料） */
  | { type: 'file-edit'; phase: 'before' | 'after'; path: string }
  /** ターンの終了 */
  /** lastMessageUuid はそのターンの最後の assistant メッセージ。会話の巻き戻しと切り出しの起点に使う */
  | { type: 'turn-end'; ok: true; usage?: Usage; lastMessageUuid?: string }
  | { type: 'turn-end'; ok: false; interrupted: boolean; reason: string };

/** ツールの実行前に届く承認の要求 */
export interface PermissionRequest {
  toolName: string;
  input: Record<string, unknown>;
  /** SDK が提案する「常に許可」の内容。中身は解釈せず、そのまま返す */
  suggestions: Record<string, unknown>[];
}

export type PermissionDecision =
  /** 許可。updatedInput は質問への答えなど、入力を差し替えて許可する時に使う */
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'allow-always'; permissions: Record<string, unknown>[] }
  | { behavior: 'deny'; message: string };
