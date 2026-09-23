import type { PermissionDecision, PermissionRequest, RunnerEvent } from '../domain/events';
import {
  createTask,
  transition,
  type PermissionMode,
  type Task,
  type TaskEvent,
  type Turn,
} from '../domain/task';
import type { AgentRunner, RunHandle, StartOptions } from '../ports/agentRunner';
import type { TaskStore } from '../ports/taskStore';

export interface TaskServiceDeps {
  runner: AgentRunner;
  store: TaskStore;
  /** タスクの ID を作る */
  newId: () => string;
  /** 現在時刻（ISO 8601） */
  now: () => string;
  /** ツールの承認をユーザーに求める。画面側が実装する */
  approve: (taskId: string, request: PermissionRequest) => Promise<PermissionDecision>;
}

export interface CreateInput {
  prompt: string;
  cwd: string;
  title?: string;
  model?: string;
  permissionMode?: PermissionMode;
}

/** Runner から届いたイベント。表示（transcript）と差分の担当が受け取る */
export interface TaskEventNotification {
  taskId: string;
  /** イベントが属するターンの番号 */
  turn: number;
  event: RunnerEvent;
}

type Listener = (task: Task) => void;
type EventListener = (notification: TaskEventNotification) => void;

/**
 * タスクの作成・起動・再開・停止・削除。
 * 状態の変更はすべてここを通り、保存してから onDidChange で画面へ伝える。
 * Runner からのイベントは短い間隔で届くので、タスクごとに読み書きを直列にして更新を失わないようにする
 */
export class TaskService {
  private readonly handles = new Map<string, RunHandle>();
  private readonly currentTurn = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly deleteListeners = new Set<(taskId: string) => void>();

  constructor(private readonly deps: TaskServiceDeps) {}

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDidReceiveEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onDidDelete(listener: (taskId: string) => void): () => void {
    this.deleteListeners.add(listener);
    return () => this.deleteListeners.delete(listener);
  }

  list(): Promise<Task[]> {
    return this.deps.store.list();
  }

  load(id: string): Promise<Task | undefined> {
    return this.deps.store.load(id);
  }

  /** 起動時に呼ぶ。前回の終了で実行中や入力待ちのまま残ったタスクを中断に直す */
  async recover(): Promise<void> {
    for (const task of await this.deps.store.list()) {
      if (task.status === 'running' || task.status === 'waiting') {
        await this.commit({ ...task, status: transition(task.status, 'host-exit') });
      }
    }
  }

  /** 終了時に呼ぶ。動いているセッションの入力を閉じ、プロセスを終わらせる */
  dispose(): void {
    for (const handle of this.handles.values()) {
      handle.close();
    }
  }

  async create(input: CreateInput): Promise<Task> {
    const now = this.deps.now();
    const created = createTask({
      id: this.deps.newId(),
      prompt: input.prompt,
      cwd: input.cwd,
      createdAt: now,
      title: input.title,
      model: input.model,
      permissionMode: input.permissionMode,
    });
    const task = await this.serialize(created.id, () =>
      this.commit(this.withTurn(created, input.prompt, now))
    );
    this.attach(task, this.deps.runner.start(this.startOptions(task, input.prompt)));
    return task;
  }

  /** 完了・失敗・中断したタスクへ追加の指示を送る */
  async send(id: string, prompt: string): Promise<void> {
    await this.mustLoad(id);
    const handle = this.handles.get(id);
    if (handle === undefined) {
      // プロセスが終わっている（VS Code の再起動など）ので、セッションを再開する
      await this.resume(id, prompt);
      return;
    }
    const next = await this.serialize(id, async () => {
      const task = await this.mustLoad(id);
      return this.commit(
        this.withTurn(
          { ...task, status: transition(task.status, 'prompt') },
          prompt,
          this.deps.now()
        )
      );
    });
    this.currentTurn.set(id, next.turns.length - 1);
    handle.send(prompt);
  }

  /** 中断したタスクを同じセッションで再開し、新しいターンを始める */
  async resume(id: string, prompt: string): Promise<void> {
    const { task, sessionId } = await this.serialize(id, async () => {
      const current = await this.mustLoad(id);
      if (current.sessionId === undefined) {
        throw new Error(`Task "${id}" has no session to resume`);
      }
      const event: TaskEvent = current.status === 'interrupted' ? 'resume' : 'prompt';
      const next = await this.commit(
        this.withTurn(
          { ...current, status: transition(current.status, event) },
          prompt,
          this.deps.now()
        )
      );
      return { task: next, sessionId: current.sessionId };
    });
    this.attach(task, this.deps.runner.resume(sessionId, this.startOptions(task, prompt)));
  }

  async stop(id: string): Promise<void> {
    await this.mustLoad(id);
    const handle = this.handles.get(id);
    if (handle !== undefined) {
      await handle.interrupt();
    }
  }

  async delete(id: string): Promise<void> {
    await this.mustLoad(id);
    const handle = this.handles.get(id);
    if (handle !== undefined) {
      await handle.interrupt();
      handle.close();
      this.handles.delete(id);
    }
    // 中断のイベントの処理より後に消す
    await this.serialize(id, () => this.deps.store.delete(id));
    for (const listener of this.deleteListeners) {
      listener(id);
    }
  }

  /** タスクを直して保存する（差分の記録など）。タスクごとに直列に実行する */
  patch(id: string, fn: (task: Task) => Task): Promise<void> {
    return this.update(id, fn);
  }

  private startOptions(task: Task, prompt: string): StartOptions {
    return {
      cwd: task.cwd,
      prompt,
      model: task.model,
      permissionMode: task.permissionMode,
      alwaysAllowed: task.alwaysAllowed,
      onPermissionRequest: (request) => this.handlePermission(task.id, request),
      onEvent: (event) => {
        const notification: TaskEventNotification = {
          taskId: task.id,
          turn: this.currentTurn.get(task.id) ?? 0,
          event,
        };
        for (const listener of this.eventListeners) {
          listener(notification);
        }
        void this.handleEvent(task.id, event);
      },
    };
  }

  private attach(task: Task, handle: RunHandle): void {
    this.handles.set(task.id, handle);
    this.currentTurn.set(task.id, task.turns.length - 1);
    void handle.done.then(() => this.handleExit(task.id, handle));
  }

  /** プロセスが終わった。結果を出さずに終わっていれば中断として扱う */
  private handleExit(id: string, handle: RunHandle): Promise<void> {
    if (this.handles.get(id) !== handle) {
      return Promise.resolve();
    }
    this.handles.delete(id);
    return this.update(id, (task) =>
      task.status === 'running' || task.status === 'waiting'
        ? this.endTurn(task, 'host-exit', { ok: false, reason: 'process exited' })
        : undefined
    );
  }

  private async handlePermission(
    id: string,
    request: PermissionRequest
  ): Promise<PermissionDecision> {
    await this.update(id, (task) =>
      task.status === 'running'
        ? { ...task, status: transition(task.status, 'permission-requested') }
        : undefined
    );
    const decision = await this.deps.approve(id, request);
    await this.update(id, (task) => ({
      ...task,
      // 待っている間に止められていれば、状態はそのまま
      status: task.status === 'waiting' ? transition(task.status, 'answered') : task.status,
      alwaysAllowed:
        decision.behavior === 'allow-always'
          ? [...task.alwaysAllowed, ...decision.permissions]
          : task.alwaysAllowed,
    }));
    return decision;
  }

  private handleEvent(id: string, event: RunnerEvent): Promise<void> {
    switch (event.type) {
      case 'init':
        return this.update(id, (task) =>
          task.sessionId === event.sessionId ? undefined : { ...task, sessionId: event.sessionId }
        );
      case 'turn-end':
        return this.update(id, (task) => {
          if (task.status !== 'running' && task.status !== 'waiting') {
            return undefined;
          }
          return event.ok
            ? this.endTurn(task, 'turn-completed', { ok: true, usage: event.usage })
            : this.endTurn(task, event.interrupted ? 'stop' : 'error', {
                ok: false,
                reason: event.reason,
              });
        });
      default:
        // text / tool-call / tool-result / file-edit は onDidReceiveEvent で表示と差分の担当へ
        return Promise.resolve();
    }
  }

  /**
   * タスクを読み、変えて、保存する。タスクごとに直列に実行する。
   * fn が undefined を返せば保存しない。タスクが消えていれば何もしない
   */
  private update(id: string, fn: (task: Task) => Task | undefined): Promise<void> {
    return this.serialize(id, async () => {
      const task = await this.deps.store.load(id);
      if (task === undefined) {
        return;
      }
      const next = fn(task);
      if (next !== undefined) {
        await this.commit(next);
      }
    });
  }

  /** 同じタスクへの読み書きを、呼ばれた順に 1 つずつ実行する */
  private serialize<T>(id: string, job: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.then(job, job);
    this.queues.set(
      id,
      next.catch(() => undefined)
    );
    return next;
  }

  private endTurn(task: Task, event: TaskEvent, result: Turn['result']): Task {
    const now = this.deps.now();
    const turns = task.turns.map((turn, i) =>
      i === task.turns.length - 1 && turn.endedAt === undefined
        ? { ...turn, endedAt: now, result }
        : turn
    );
    return { ...task, status: transition(task.status, event), turns };
  }

  private withTurn(task: Task, prompt: string, startedAt: string): Task {
    const turn: Turn = {
      index: task.turns.length,
      prompt,
      attachments: [],
      startedAt,
      changes: [],
    };
    return { ...task, turns: [...task.turns, turn] };
  }

  private async mustLoad(id: string): Promise<Task> {
    const task = await this.deps.store.load(id);
    if (task === undefined) {
      throw new Error(`Task "${id}" not found`);
    }
    return task;
  }

  /** 保存してから、変更を画面へ伝える */
  private async commit(task: Task): Promise<Task> {
    const saved = { ...task, updatedAt: this.deps.now() };
    await this.deps.store.save(saved);
    for (const listener of this.listeners) {
      listener(saved);
    }
    return saved;
  }
}
