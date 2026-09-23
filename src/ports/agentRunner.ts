import type { PermissionMode, PermissionRule } from '../domain/task';
import type { PermissionDecision, PermissionRequest, RunnerEvent } from '../domain/events';

export interface StartOptions {
  cwd: string;
  prompt: string;
  model?: string;
  permissionMode: PermissionMode;
  /** 「このタスクでは常に許可」で保存した内容。再開時に SDK へ写す */
  alwaysAllowed: PermissionRule[];
  onPermissionRequest: (request: PermissionRequest) => Promise<PermissionDecision>;
  onEvent: (event: RunnerEvent) => void;
}

export interface RunHandle {
  /** 同じセッションへ追加の指示を送る */
  send(prompt: string): void;
  /** 実行中のターンを止める */
  interrupt(): Promise<void>;
  /** 次のターンから使うモデルを変える。undefined で Claude Code の既定に戻す */
  setModel(model: string | undefined): Promise<void>;
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
