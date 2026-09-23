import type { PermissionDecision, PermissionRequest } from '../domain/events';

/** 画面に出している承認の要求。id で返事と突き合わせる */
export interface PendingRequest extends PermissionRequest {
  id: string;
}

type Listener = (taskId: string, pending: PendingRequest | undefined) => void;

interface Entry {
  pending: PendingRequest;
  resolve: (decision: PermissionDecision) => void;
}

/**
 * ツールの承認の保留と返事。Runner の canUseTool から request が呼ばれ、
 * 画面が decide を呼ぶまで待つ。タスクごとに同時に 1 つだけ保留する
 */
export class ApprovalService {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly newId: () => string) {}

  request(taskId: string, request: PermissionRequest): Promise<PermissionDecision> {
    this.cancel(taskId);
    const pending: PendingRequest = { id: this.newId(), ...request };
    return new Promise<PermissionDecision>((resolve) => {
      this.entries.set(taskId, { pending, resolve });
      this.emit(taskId, pending);
    });
  }

  pending(taskId: string): PendingRequest | undefined {
    return this.entries.get(taskId)?.pending;
  }

  /** 返事を返す。id が今の要求と違えば無視する */
  decide(taskId: string, requestId: string, decision: PermissionDecision): void {
    const entry = this.entries.get(taskId);
    if (entry === undefined || entry.pending.id !== requestId) {
      return;
    }
    this.entries.delete(taskId);
    entry.resolve(decision);
    this.emit(taskId, undefined);
  }

  /** 保留中の要求を拒否として片付ける（停止、削除、失敗の時） */
  cancel(taskId: string): void {
    const entry = this.entries.get(taskId);
    if (entry === undefined) {
      return;
    }
    this.entries.delete(taskId);
    entry.resolve({
      behavior: 'deny',
      message: 'The task was stopped before the request was answered.',
    });
    this.emit(taskId, undefined);
  }

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(taskId: string, pending: PendingRequest | undefined): void {
    for (const listener of this.listeners) {
      listener(taskId, pending);
    }
  }
}
