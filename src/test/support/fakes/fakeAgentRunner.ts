import type { AgentRunner, RunHandle, StartOptions } from '../../../ports/agentRunner';
import type { PermissionDecision, PermissionRequest, RunnerEvent } from '../../../domain/events';

/** テストから操作できる RunHandle。イベントの発火と承認の要求を外から起こせる */
export class FakeRunHandle implements RunHandle {
  readonly sent: string[] = [];
  interrupted = false;
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

/** 起動の記録を残し、ハンドルをテストへ渡すフェイク */
export class FakeAgentRunner implements AgentRunner {
  readonly starts: FakeRunHandle[] = [];
  readonly resumes: { sessionId: string; handle: FakeRunHandle }[] = [];

  start(options: StartOptions): RunHandle {
    const handle = new FakeRunHandle(options);
    this.starts.push(handle);
    return handle;
  }

  resume(sessionId: string, options: StartOptions): RunHandle {
    const handle = new FakeRunHandle(options);
    this.resumes.push({ sessionId, handle });
    return handle;
  }

  /** 直近に起動または再開したハンドル */
  get last(): FakeRunHandle {
    const all = [...this.starts, ...this.resumes.map((r) => r.handle)];
    const handle = all[all.length - 1];
    if (handle === undefined) {
      throw new Error('no run has been started');
    }
    return handle;
  }
}
