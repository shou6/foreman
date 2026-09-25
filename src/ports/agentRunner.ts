import type { EffortLevel, PermissionMode, PermissionRule } from '../domain/task';
import type { PermissionDecision, PermissionRequest, RunnerEvent } from '../domain/events';
import type { McpServerInfo } from '../domain/mcp';

export interface StartOptions {
  cwd: string;
  prompt: string;
  model?: string;
  /** Effort。無ければ Claude Code に従う */
  effort?: EffortLevel;
  permissionMode: PermissionMode;
  /** 「このタスクでは常に許可」で保存した内容。再開時に SDK へ写す */
  alwaysAllowed: PermissionRule[];
  onPermissionRequest: (request: PermissionRequest) => Promise<PermissionDecision>;
  onEvent: (event: RunnerEvent) => void;
  /** resume の時、このメッセージ（uuid）までで会話を切って再開する */
  resumeAt?: string;
  /** resume の時、元のセッションを変えずに新しいセッションへ分岐する */
  fork?: boolean;
}

export interface RunHandle {
  /** 同じセッションへ追加の指示を送る */
  send(prompt: string): void;
  /** コンテキストを圧縮する（/compact）。ターンは開かない */
  compact(): void;
  /** 実行中のターンを止める */
  interrupt(): Promise<void>;
  /** 次のターンから使うモデルを変える。undefined で Claude Code の既定に戻す */
  setModel(model: string | undefined): Promise<void>;
  /** 次のターンから使う Effort を変える。undefined で Claude Code に従う */
  setEffort(effort: EffortLevel | undefined): Promise<void>;
  /** 承認方式を変える（プランモードの出入りなど）。次のターンから効く */
  setPermissionMode(mode: PermissionMode): Promise<void>;
  /** MCP サーバーの接続の状態を聞く（動いているセッションの Claude Code に） */
  mcpServers(): Promise<McpServerInfo[]>;
  /** 入力を閉じてプロセスを終わらせる。セッションは resume で続けられる */
  close(): void;
  /** プロセスが終わった時に解決する。異常終了は reject ではなく、turn-end イベントで伝える */
  done: Promise<void>;
}

/** Claude Code のセッションの起動と対話。実装は adapters/agentSdkRunner.ts、テストでは FakeAgentRunner */
export interface AgentRunner {
  start(options: StartOptions): RunHandle;
  resume(sessionId: string, options: StartOptions): RunHandle;
}
