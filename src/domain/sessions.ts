import type { RunnerEvent } from './events';

/** Claude Code のセッション（CLI や公式拡張で始めたものを含む）。取り込む候補の一覧に出す */
export interface SessionSummary {
  sessionId: string;
  /** 自分で付けた名前、自動の要約、最初の指示の順 */
  title: string;
  /** 最後に更新した時刻（エポックミリ秒） */
  lastModified: number;
  cwd?: string;
  gitBranch?: string;
  firstPrompt?: string;
}

/**
 * 取り込むセッションの 1 ターン。人の指示と、その後の出力・ツールの呼び出しをイベントにしたもの。
 * events の最後は turn-end
 */
export interface ImportedTurn {
  prompt: string;
  startedAt?: string;
  /** このターンの最後の assistant メッセージの uuid。巻き戻しと分岐の起点 */
  lastMessageUuid?: string;
  events: RunnerEvent[];
}
