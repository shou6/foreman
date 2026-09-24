import { promptWithAttachments, type Attachment } from '../domain/attachments';
import { resumePrompt } from '../domain/resumePrompt';
import type { PermissionDecision, PermissionRequest, RunnerEvent } from '../domain/events';
import {
  createTask,
  isTurnOpen,
  canUnapprove,
  transition,
  type EffortLevel,
  type FileChange,
  type PermissionMode,
  type Task,
  type TaskEvent,
  type Turn,
  type Worktree,
} from '../domain/task';
import { titleFromPrompt } from '../domain/taskTitle';
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
  /** 先に決めた ID。省略すれば newId で作る */
  id?: string;
  prompt: string;
  cwd: string;
  title?: string;
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  /** 添付したファイルの絶対パス */
  attachments?: Attachment[];
  /** 使う worktree。渡すと Claude はその場所で動く */
  worktree?: Worktree;
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
  /** 承認の要求に答えていないタスク */
  private readonly pendingPermission = new Set<string>();
  private readonly currentTurn = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly deleteListeners = new Set<(taskId: string, task: Task) => void>();

  constructor(private readonly deps: TaskServiceDeps) {}

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDidReceiveEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onDidDelete(listener: (taskId: string, task: Task) => void): () => void {
    this.deleteListeners.add(listener);
    return () => this.deleteListeners.delete(listener);
  }

  list(): Promise<Task[]> {
    return this.deps.store.list();
  }

  load(id: string): Promise<Task | undefined> {
    return this.deps.store.load(id);
  }

  /**
   * 起動時に呼ぶ。前回の終了で実行中や入力待ちのまま残ったタスクを中断に直し、
   * そのターンの中断を表示側にも伝える
   */
  async recover(): Promise<void> {
    for (const task of await this.deps.store.list()) {
      if (isTurnOpen(task)) {
        const reason = 'VS Code was closed';
        const event: RunnerEvent = { type: 'turn-end', ok: false, interrupted: true, reason };
        await this.commit(this.endTurn(task, 'host-exit', { ok: false, reason }));
        const notification: TaskEventNotification = {
          taskId: task.id,
          turn: task.turns.length - 1,
          event,
        };
        for (const listener of this.eventListeners) {
          listener(notification);
        }
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
      id: input.id ?? this.deps.newId(),
      prompt: input.prompt,
      cwd: input.cwd,
      worktree: input.worktree,
      createdAt: now,
      title: input.title,
      model: input.model,
      effort: input.effort,
      permissionMode: input.permissionMode,
    });
    const attachments = input.attachments ?? [];
    const task = await this.serialize(created.id, () =>
      this.commit(this.withTurn(created, input.prompt, attachments, now))
    );
    this.attach(
      task,
      this.deps.runner.start(
        this.startOptions(task, promptWithAttachments(input.prompt, attachments))
      )
    );
    return task;
  }

  /** 下書きを作る。セッションは起動しない（FR-TASK-11） */
  async createDraft(input: CreateInput): Promise<Task> {
    const now = this.deps.now();
    const created = createTask({
      id: input.id ?? this.deps.newId(),
      prompt: input.prompt,
      cwd: input.cwd,
      createdAt: now,
      title: input.title,
      model: input.model,
      effort: input.effort,
      permissionMode: input.permissionMode,
      draft: true,
    });
    return this.serialize(created.id, () => this.commit(created));
  }

  /** 下書きの指示を書き換える。タイトルを自分で付けていなければ追従する */
  async updateDraft(id: string, prompt: string): Promise<void> {
    await this.update(id, (task) => {
      if (task.status !== 'draft') {
        throw new Error(`Task "${id}" is not a draft`);
      }
      const title = titleFromPrompt(prompt);
      if (title === undefined) {
        throw new Error('prompt must not be empty');
      }
      const keepTitle = task.title !== titleFromPrompt(task.draftPrompt ?? '');
      return { ...task, draftPrompt: prompt, title: keepTitle ? task.title : title };
    });
  }

  /** 下書きを開始する。worktree を渡すとその場所で動く */
  async start(
    id: string,
    options: { worktree?: Worktree; attachments?: Attachment[] } = {}
  ): Promise<Task> {
    const attachments = options.attachments ?? [];
    const { task, prompt } = await this.serialize(id, async () => {
      const current = await this.mustLoad(id);
      if (current.status !== 'draft' || current.draftPrompt === undefined) {
        throw new Error(`Task "${id}" is not a draft`);
      }
      const prompt = current.draftPrompt;
      const started: Task = {
        ...current,
        status: transition(current.status, 'start'),
        draftPrompt: undefined,
        worktree: options.worktree ?? current.worktree,
        cwd: options.worktree?.path ?? current.cwd,
      };
      return {
        task: await this.commit(this.withTurn(started, prompt, attachments, this.deps.now())),
        prompt,
      };
    });
    this.attach(
      task,
      this.deps.runner.start(this.startOptions(task, promptWithAttachments(prompt, attachments)))
    );
    return task;
  }

  /** ターンの変更を記録する。完了したタスクに変更が付けばレビュー待ちに進む */
  recordChanges(id: string, turn: number, changes: FileChange[]): Promise<void> {
    return this.update(id, (task) => {
      const turns = task.turns.map((t, i) => (i === turn ? { ...t, changes } : t));
      const last = task.turns[task.turns.length - 1];
      const status =
        (task.status === 'done' || task.status === 'waiting') &&
        changes.length > 0 &&
        turn === task.turns.length - 1 &&
        last?.endedAt !== undefined
          ? transition(task.status, 'changes-recorded')
          : task.status;
      return { ...task, turns, status };
    });
  }

  /** 完了にする。レビュー待ちの変更を確認済みにするか、返答を待っているタスクを閉じる */
  async approve(id: string): Promise<void> {
    await this.update(id, (task) => {
      if (task.status === 'waiting' && this.pendingPermission.has(id)) {
        throw new Error(`Task "${id}" is waiting for an approval; answer it first`);
      }
      if (task.status !== 'review' && task.status !== 'waiting') {
        throw new Error(
          `Task "${id}" is ${task.status}; only review or waiting tasks can be completed`
        );
      }
      const approvedFrom = task.status === 'review' ? 'review' : 'waiting';
      return { ...task, status: transition(task.status, 'approve'), approvedFrom };
    });
  }

  /** 承認を取り消し、承認の前の状態（レビュー待ちか返答待ち）に戻す */
  async unapprove(id: string): Promise<void> {
    await this.update(id, (task) => {
      if (!canUnapprove(task) || task.approvedFrom === undefined) {
        throw new Error(`The approval of task "${id}" cannot be undone`);
      }
      return { ...task, status: task.approvedFrom, approvedFrom: undefined };
    });
  }

  /** タスク名を変える（任意の文字列）。空白だけは受け付けない */
  async rename(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (trimmed === '') {
      throw new Error('title must not be empty');
    }
    await this.update(id, (task) =>
      task.title === trimmed ? undefined : { ...task, title: trimmed }
    );
  }

  /** ボードの並び。渡した順に order を振る */
  async reorder(ids: readonly string[]): Promise<void> {
    for (const [order, id] of ids.entries()) {
      await this.update(id, (task) => (task.order === order ? undefined : { ...task, order }));
    }
  }

  /** 完了・失敗・中断したタスクへ追加の指示を送る */
  async send(id: string, prompt: string, attachments: Attachment[] = []): Promise<void> {
    await this.mustLoad(id);
    if (this.pendingPermission.has(id)) {
      throw new Error(`Task "${id}" is waiting for an approval; answer it first`);
    }
    const handle = this.handles.get(id);
    if (handle === undefined) {
      // プロセスが終わっている（VS Code の再起動など）ので、セッションを再開する
      await this.resume(id, prompt, attachments);
      return;
    }
    const next = await this.serialize(id, async () => {
      const task = await this.mustLoad(id);
      return this.commit(
        this.withTurn(
          { ...task, status: transition(task.status, 'prompt') },
          prompt,
          attachments,
          this.deps.now()
        )
      );
    });
    this.currentTurn.set(id, next.turns.length - 1);
    handle.send(promptWithAttachments(prompt, attachments));
  }

  /** 中断したタスクを同じセッションで再開し、新しいターンを始める */
  async resume(id: string, prompt: string, attachments: Attachment[] = []): Promise<void> {
    const { task, sessionId, previous } = await this.serialize(id, async () => {
      const current = await this.mustLoad(id);
      if (current.sessionId === undefined) {
        throw new Error(`Task "${id}" has no session to resume`);
      }
      const event: TaskEvent = current.status === 'interrupted' ? 'resume' : 'prompt';
      const next = await this.commit(
        this.withTurn(
          { ...current, status: transition(current.status, event), resumeAt: undefined },
          prompt,
          attachments,
          this.deps.now()
        )
      );
      return { task: next, sessionId: current.sessionId, previous: current };
    });
    this.attach(
      task,
      this.deps.runner.resume(sessionId, {
        ...this.startOptions(
          task,
          promptWithAttachments(resumePrompt(previous, prompt), attachments)
        ),
        // 会話を戻した後は、その地点から分岐した新しいセッションで続ける
        resumeAt: previous.resumeAt,
        fork: previous.resumeAt !== undefined ? true : undefined,
      })
    );
  }

  /**
   * 会話を指定のターンの直後まで戻す（FR-DIFF-8）。それより後のターンは消え、
   * 次の指示はそのターンの最後のメッセージから分岐した新しいセッションで続く
   */
  async rewindConversation(id: string, turn: number): Promise<void> {
    const task = await this.mustLoad(id);
    if (isTurnOpen(task) || this.pendingPermission.has(id)) {
      throw new Error(`Task "${id}" is running; stop it before rewinding`);
    }
    const target = task.turns[turn];
    if (target === undefined) {
      throw new Error(`Turn ${turn} not found`);
    }
    await this.close(id);
    await this.update(id, (t) => ({
      ...t,
      status: 'waiting',
      turns: t.turns.slice(0, turn + 1),
      resumeAt: target.lastMessageUuid,
    }));
  }

  /** 親の会話を引き継いだ新しいタスクを作る（FR-TASK-12）。fromTurn を指定すると、そのターンの直後から分岐する */
  async fork(parentId: string, input: CreateInput & { fromTurn?: number }): Promise<Task> {
    const parent = await this.mustLoad(parentId);
    if (parent.sessionId === undefined) {
      throw new Error(`Task "${parentId}" has no session to fork`);
    }
    const resumeAt =
      input.fromTurn === undefined ? undefined : parent.turns[input.fromTurn]?.lastMessageUuid;
    const now = this.deps.now();
    const created = createTask({
      id: input.id ?? this.deps.newId(),
      prompt: input.prompt,
      cwd: input.cwd,
      worktree: input.worktree,
      createdAt: now,
      title: input.title,
      model: input.model ?? parent.model,
      effort: parent.effort,
      permissionMode: input.permissionMode ?? parent.permissionMode,
      parentTaskId: parentId,
    });
    const attachments = input.attachments ?? [];
    const task = await this.serialize(created.id, () =>
      this.commit(this.withTurn(created, input.prompt, attachments, now))
    );
    this.attach(
      task,
      this.deps.runner.resume(parent.sessionId, {
        ...this.startOptions(task, promptWithAttachments(input.prompt, attachments)),
        resumeAt,
        fork: true,
      })
    );
    return task;
  }

  /** 次のターンから使うモデルを変える（FR-VIEW-4）。undefined で Claude Code の既定 */
  async setModel(id: string, model: string | undefined): Promise<void> {
    await this.mustLoad(id);
    await this.update(id, (task) => ({ ...task, model }));
    await this.handles.get(id)?.setModel(model);
  }

  /** 次のターンから使う Effort を変える。undefined で Claude Code に従う */
  async setEffort(id: string, effort: EffortLevel | undefined): Promise<void> {
    await this.mustLoad(id);
    await this.update(id, (task) => ({ ...task, effort }));
    await this.handles.get(id)?.setEffort(effort);
  }

  /**
   * セッションの入力を閉じてプロセスを終わらせ、終了を待つ。タスクの状態は変えない。
   * worktree を消す前など、作業ディレクトリを掴んでいるプロセスを手放したい時に使う
   */
  async close(id: string): Promise<void> {
    const handle = this.handles.get(id);
    if (handle === undefined) {
      return;
    }
    this.handles.delete(id);
    handle.close();
    await handle.done;
  }

  async stop(id: string): Promise<void> {
    await this.mustLoad(id);
    const handle = this.handles.get(id);
    if (handle !== undefined) {
      await handle.interrupt();
    }
  }

  async delete(id: string): Promise<void> {
    const deleting = await this.mustLoad(id);
    const handle = this.handles.get(id);
    if (handle !== undefined) {
      await handle.interrupt();
      handle.close();
      this.handles.delete(id);
    }
    // 中断のイベントの処理より後に消す
    await this.serialize(id, () => this.deps.store.delete(id));
    for (const listener of this.deleteListeners) {
      listener(id, deleting);
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
      effort: task.effort,
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
      isTurnOpen(task)
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
    this.pendingPermission.add(id);
    let decision: PermissionDecision;
    try {
      decision = await this.deps.approve(id, request);
    } finally {
      this.pendingPermission.delete(id);
    }
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
          task.sessionId === event.sessionId && task.activeModel === event.model
            ? undefined
            : { ...task, sessionId: event.sessionId, activeModel: event.model }
        );
      case 'effort':
        return this.update(id, (task) =>
          task.activeEffort === event.effort ? undefined : { ...task, activeEffort: event.effort }
        );
      case 'turn-end':
        return this.update(id, (task) => {
          if (task.status !== 'running' && task.status !== 'waiting') {
            return undefined;
          }
          return event.ok
            ? this.endTurn(
                task,
                'turn-completed',
                { ok: true, usage: event.usage },
                event.lastMessageUuid
              )
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

  private endTurn(
    task: Task,
    event: TaskEvent,
    result: Turn['result'],
    lastMessageUuid?: string
  ): Task {
    const now = this.deps.now();
    const turns = task.turns.map((turn, i) =>
      i === task.turns.length - 1 && turn.endedAt === undefined
        ? {
            ...turn,
            endedAt: now,
            result,
            lastMessageUuid: lastMessageUuid ?? turn.lastMessageUuid,
          }
        : turn
    );
    const completed = transition(task.status, event);
    // 変更を伴うターンはレビュー待ちにする（要件定義書 5.1）。変更が無ければ次の指示待ち
    const status =
      event === 'turn-completed' && (turns[turns.length - 1]?.changes.length ?? 0) > 0
        ? transition(completed, 'changes-recorded')
        : completed;
    return { ...task, status, turns };
  }

  private withTurn(task: Task, prompt: string, attachments: Attachment[], startedAt: string): Task {
    const turn: Turn = {
      index: task.turns.length,
      prompt,
      attachments: [...attachments],
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
    // 承認の前の状態は、完了の間だけ持つ
    if (saved.status !== 'done') {
      delete saved.approvedFrom;
    }
    await this.deps.store.save(saved);
    for (const listener of this.listeners) {
      listener(saved);
    }
    return saved;
  }
}
