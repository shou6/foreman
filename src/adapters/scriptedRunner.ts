import type { AgentRunner, RunHandle, StartOptions } from '../ports/agentRunner';
import type { PermissionDecision, PermissionRequest, RunnerEvent } from '../domain/events';
import type { EffortLevel } from '../domain/task';

/**
 * 台本で動かす Runner。Claude を起動せず、テストがイベントを外から起こす。
 * 単体テストのフェイクと、統合テスト（FOREMAN_SCRIPTED_RUNNER=1 で拡張機能に差し込む）の両方で使う
 */
export class ScriptedRunHandle implements RunHandle {
  readonly sent: string[] = [];
  readonly models: (string | undefined)[] = [];
  readonly efforts: (EffortLevel | undefined)[] = [];
  interrupted = false;
  closed = false;
  private resolveDone!: () => void;
  readonly done: Promise<void>;

  constructor(readonly options: StartOptions) {
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  send(prompt: string): void {
    this.sent.push(prompt);
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    this.emit({ type: 'turn-end', ok: false, interrupted: true, reason: 'interrupted' });
  }

  async setModel(model: string | undefined): Promise<void> {
    this.models.push(model);
  }

  async setEffort(effort: EffortLevel | undefined): Promise<void> {
    this.efforts.push(effort);
  }

  close(): void {
    this.closed = true;
    this.resolveDone();
  }

  /** Runner からイベントが届いたことにする */
  emit(event: RunnerEvent): void {
    this.options.onEvent(event);
  }

  /** ツールの承認を求め、返事を待つ */
  requestPermission(request: PermissionRequest): Promise<PermissionDecision> {
    return this.options.onPermissionRequest(request);
  }

  /** プロセスが終わったことにする */
  finish(): void {
    this.resolveDone();
  }
}

/** 起動の記録を残し、ハンドルをテストへ渡す */
export class ScriptedRunner implements AgentRunner {
  readonly starts: ScriptedRunHandle[] = [];
  readonly resumes: { sessionId: string; handle: ScriptedRunHandle }[] = [];

  start(options: StartOptions): RunHandle {
    const handle = new ScriptedRunHandle(options);
    this.starts.push(handle);
    return handle;
  }

  resume(sessionId: string, options: StartOptions): RunHandle {
    const handle = new ScriptedRunHandle(options);
    this.resumes.push({ sessionId, handle });
    return handle;
  }

  /** 直近に起動または再開したハンドル */
  get last(): ScriptedRunHandle {
    const all = [...this.starts, ...this.resumes.map((r) => r.handle)];
    const handle = all[all.length - 1];
    if (handle === undefined) {
      throw new Error('no run has been started');
    }
    return handle;
  }
}
