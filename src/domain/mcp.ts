/** MCP サーバーの接続の状態（Claude Code の mcpServerStatus から） */
export type McpStatus = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';

export interface McpServerInfo {
  name: string;
  status: McpStatus;
  /** 失敗の理由（failed の時） */
  error?: string;
  /** 設定の場所（user、project など） */
  scope?: string;
}
