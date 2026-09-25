import type { ImportedTurn, SessionSummary } from '../domain/sessions';

/** Claude Code のセッションの一覧と履歴。実装は adapters/agentSdkSessionCatalog.ts */
export interface SessionCatalog {
  /** 作業フォルダのセッションを新しい順に */
  list(dir: string): Promise<SessionSummary[]>;
  /** セッションの履歴をターンに分けて読む */
  history(sessionId: string, dir: string): Promise<ImportedTurn[]>;
}
