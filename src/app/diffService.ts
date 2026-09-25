import { countChanges, lineDiff, type DiffLine } from '../domain/diff';
import type { FileChange, Task } from '../domain/task';
import type { FileSystem } from '../ports/fileSystem';
import type { SnapshotStore } from '../ports/snapshotStore';
import type { TaskService } from './taskService';

export interface DiffServiceDeps {
  service: TaskService;
  fs: FileSystem;
  snapshots: SnapshotStore;
  /** パスの区切り（Windows は \\） */
  sep: string;
  /** 監視で拾ったパス（cwd からの相対）のうち、記録しないもの（git が無視するファイルなど） */
  isIgnored?: (dir: string, paths: string[]) => Promise<string[]>;
  /** 変更前が分からないファイルの、基準の内容（Git の HEAD など）。無ければ undefined */
  baseline?: (dir: string, path: string) => Promise<string | undefined>;
}

/** 監視で無視するフォルダ */
const EXCLUDED = ['node_modules', '.git'];

/** ターン中に見つけた 1 ファイルの記録。content が undefined は「ファイルが無い」 */
interface Entry {
  source: 'edit-tool' | 'watcher';
  beforeKnown: boolean;
  before?: string;
  afterKnown: boolean;
  after?: string;
}

interface ActiveTurn {
  turn: number;
  cwd: string;
  entries: Map<string, Entry>;
  stopWatching: () => void;
  queue: Promise<unknown>;
}

/**
 * ターンごとの変更の記録と「戻す」（実装計画書 4.4）。Git に依存しない。
 * 編集ツールの前後は hooks のイベントで、それ以外の変更は作業ディレクトリの監視で拾う
 */
export class DiffService {
  private readonly active = new Map<string, ActiveTurn>();
  private readonly startedTurn = new Map<string, number>();

  constructor(private readonly deps: DiffServiceDeps) {
    deps.service.onDidChange((task) => this.onTaskChanged(task));
    deps.service.onDidReceiveEvent(({ taskId, event }) => {
      if (event.type === 'file-edit') {
        this.enqueue(taskId, () => this.onFileEdit(taskId, event.phase, event.path));
      } else if (event.type === 'turn-end') {
        this.enqueue(taskId, () => this.finalize(taskId));
      }
    });
    deps.service.onDidDelete((taskId, task) => {
      this.active.get(taskId)?.stopWatching();
      this.active.delete(taskId);
      this.startedTurn.delete(taskId);
      void this.cleanup(task);
    });
  }

  /** ファイルを変更前に戻す（FR-DIFF-5、FR-DIFF-6） */
  async revert(taskId: string, turn: number, path: string): Promise<void> {
    const task = await this.deps.service.load(taskId);
    assertNotPruned(task);
    const change = task?.turns[turn]?.changes.find((c) => c.path === path);
    if (task === undefined || change === undefined) {
      throw new Error(`Change "${path}" not found in turn ${turn}`);
    }
    if (!canRevert(change)) {
      throw new Error(`Cannot revert "${path}": the previous content is unknown`);
    }
    await this.restore(task, change);
    await this.markReverted(taskId, turn, [path]);
  }

  /**
   * 指定したターンより後の変更を新しい順に戻す（FR-DIFF-8 のファイル側）。
   * afterTurn に -1 を渡すと全ターン。戻せなかった（変更前が不明な）パスを返す
   */
  async revertAfter(taskId: string, afterTurn: number): Promise<string[]> {
    const task = await this.deps.service.load(taskId);
    assertNotPruned(task);
    if (task === undefined) {
      throw new Error(`Task "${taskId}" not found`);
    }
    const skipped: string[] = [];
    for (let i = task.turns.length - 1; i > afterTurn; i--) {
      const turn = task.turns[i];
      if (turn === undefined) {
        continue;
      }
      const done: string[] = [];
      for (const change of [...turn.changes].reverse()) {
        if (change.reverted) {
          continue;
        }
        if (!canRevert(change)) {
          skipped.push(change.path);
          continue;
        }
        await this.restore(task, change);
        done.push(change.path);
      }
      if (done.length > 0) {
        await this.markReverted(taskId, i, done);
      }
    }
    return skipped;
  }

  private async restore(task: Task, change: FileChange): Promise<void> {
    const absolute = task.cwd + this.deps.sep + change.path;
    if (change.kind === 'created') {
      await this.deps.fs.deleteFile(absolute);
      return;
    }
    const content = await this.deps.snapshots.load(change.before ?? '');
    if (content === undefined) {
      throw new Error(`Cannot revert "${change.path}": the snapshot is missing`);
    }
    await this.deps.fs.writeFile(absolute, content);
  }

  private markReverted(taskId: string, turn: number, paths: readonly string[]): Promise<void> {
    return this.deps.service.patch(taskId, (t) => ({
      ...t,
      turns: t.turns.map((tt, i) =>
        i === turn
          ? {
              ...tt,
              changes: tt.changes.map((c) =>
                paths.includes(c.path) ? { ...c, reverted: true } : c
              ),
            }
          : tt
      ),
    }));
  }

  /** 消したタスクのスナップショットのうち、ほかのタスクから参照されないものを消す（NFR-4） */
  private async cleanup(deleted: Task): Promise<void> {
    const referenced = new Set<string>();
    for (const task of await this.deps.service.list()) {
      for (const hash of hashesOf(task)) {
        referenced.add(hash);
      }
    }
    for (const hash of hashesOf(deleted)) {
      if (!referenced.has(hash)) {
        await this.deps.snapshots.delete(hash);
      }
    }
  }

  /**
   * 保存期間を過ぎたタスクのスナップショットを消す（NFR-4）。ほかのタスクと共有する分は残す。
   * タスクの記録と会話の履歴は残し、消した印を付ける
   */
  async prune(taskIds: readonly string[], now: string): Promise<void> {
    const targets = new Set(taskIds);
    const tasks = await this.deps.service.list();
    const referenced = new Set<string>();
    for (const task of tasks) {
      if (!targets.has(task.id) && task.snapshotsPrunedAt === undefined) {
        hashesOf(task).forEach((hash) => referenced.add(hash));
      }
    }
    for (const task of tasks) {
      if (!targets.has(task.id)) {
        continue;
      }
      for (const hash of new Set(hashesOf(task))) {
        if (!referenced.has(hash)) {
          await this.deps.snapshots.delete(hash);
        }
      }
      await this.deps.service.patch(task.id, (t) => ({ ...t, snapshotsPrunedAt: now }));
    }
  }

  /** インライン差分の材料（FR-DIFF-3） */
  async diffOf(
    taskId: string,
    turn: number,
    path: string
  ): Promise<{ before: string | undefined; after: string | undefined; lines: DiffLine[] }> {
    const task = await this.deps.service.load(taskId);
    const change = task?.turns[turn]?.changes.find((c) => c.path === path);
    if (change === undefined) {
      throw new Error(`Change "${path}" not found in turn ${turn}`);
    }
    const before =
      change.before === undefined ? undefined : await this.deps.snapshots.load(change.before);
    const after =
      change.after === undefined ? undefined : await this.deps.snapshots.load(change.after);
    return { before, after, lines: lineDiff(before, after) };
  }

  private onTaskChanged(task: Task): void {
    const turn = task.turns.length - 1;
    if (task.status !== 'running' || turn < 0 || this.startedTurn.get(task.id) === turn) {
      return;
    }
    this.startedTurn.set(task.id, turn);
    this.active.get(task.id)?.stopWatching();
    const entries = new Map<string, Entry>();
    const stopWatching = this.deps.fs.watch(task.cwd, (path) => {
      if (this.isExcluded(task.cwd, path) || entries.has(path)) {
        return;
      }
      entries.set(path, { source: 'watcher', beforeKnown: false, afterKnown: false });
    });
    this.active.set(task.id, {
      turn,
      cwd: task.cwd,
      entries,
      stopWatching,
      queue: Promise.resolve(),
    });
  }

  private async onFileEdit(taskId: string, phase: 'before' | 'after', path: string): Promise<void> {
    const active = this.active.get(taskId);
    if (active === undefined) {
      return;
    }
    const entry = active.entries.get(path) ?? {
      source: 'edit-tool',
      beforeKnown: false,
      afterKnown: false,
    };
    entry.source = 'edit-tool';
    active.entries.set(path, entry);
    if (phase === 'before') {
      if (!entry.beforeKnown) {
        entry.before = await this.deps.fs.readFile(path);
        entry.beforeKnown = true;
      }
    } else {
      entry.after = await this.deps.fs.readFile(path);
      entry.afterKnown = true;
    }
  }

  private async finalize(taskId: string): Promise<void> {
    const active = this.active.get(taskId);
    if (active === undefined) {
      return;
    }
    active.stopWatching();
    this.active.delete(taskId);
    const task = await this.deps.service.load(taskId);
    if (task === undefined) {
      return;
    }
    // 監視で拾っただけのファイルは、git が無視するもの（生成物など）を除く
    const watched = [...active.entries]
      .filter(([, entry]) => entry.source === 'watcher')
      .map(([path]) => this.relative(active.cwd, path));
    const ignored = new Set(
      watched.length > 0 && this.deps.isIgnored !== undefined
        ? await this.deps.isIgnored(active.cwd, watched)
        : []
    );
    const changes: FileChange[] = [];
    for (const [path, entry] of active.entries) {
      const relative = this.relative(active.cwd, path);
      if (entry.source === 'watcher' && ignored.has(relative)) {
        continue;
      }
      if (!entry.afterKnown) {
        entry.after = await this.deps.fs.readFile(path);
        entry.afterKnown = true;
      }
      if (!entry.beforeKnown) {
        const previous = this.previousAfter(task, active.turn, relative);
        if (previous !== undefined) {
          entry.before =
            previous.hash === undefined ? undefined : await this.deps.snapshots.load(previous.hash);
          entry.beforeKnown = true;
        } else if (this.deps.baseline !== undefined) {
          // Git にある版を変更前として使う（npm install などによる変更を普通の差分で見せる）
          const base = await this.deps.baseline(active.cwd, relative);
          if (base !== undefined) {
            entry.before = base;
            entry.beforeKnown = true;
          }
        }
      }
      if (entry.beforeKnown && entry.before === entry.after) {
        continue;
      }
      // ターン中に作られて消えた一時ファイル（編集ツールの書き込み用など）は変更ではない
      if (!entry.beforeKnown && entry.after === undefined) {
        continue;
      }
      const kind: FileChange['kind'] =
        entry.after === undefined
          ? 'deleted'
          : entry.beforeKnown && entry.before === undefined
            ? 'created'
            : 'modified';
      const counts = entry.beforeKnown
        ? countChanges(lineDiff(entry.before, entry.after))
        : undefined;
      changes.push({
        path: relative,
        kind,
        before:
          entry.before === undefined ? undefined : await this.deps.snapshots.save(entry.before),
        after: entry.after === undefined ? undefined : await this.deps.snapshots.save(entry.after),
        source: entry.source,
        reverted: false,
        added: counts?.added,
        removed: counts?.removed,
      });
    }
    await this.deps.service.recordChanges(taskId, active.turn, changes);
  }

  /** 前のターンまでで、同じファイルの最後の変更後。無ければ undefined。削除されていれば hash が undefined */
  private previousAfter(
    task: Task,
    turn: number,
    path: string
  ): { hash: string | undefined } | undefined {
    for (let i = turn - 1; i >= 0; i--) {
      const change = task.turns[i]?.changes.find((c) => c.path === path);
      if (change !== undefined) {
        return { hash: change.after };
      }
    }
    return undefined;
  }

  private enqueue(taskId: string, job: () => Promise<void>): void {
    const active = this.active.get(taskId);
    if (active === undefined) {
      return;
    }
    active.queue = active.queue.then(job, job);
  }

  private isExcluded(cwd: string, path: string): boolean {
    const relative = this.relative(cwd, path);
    const first = relative.split(/[\\/]/)[0];
    return first === undefined || EXCLUDED.includes(first);
  }

  private relative(cwd: string, path: string): string {
    const prefix = cwd.endsWith(this.deps.sep) ? cwd : cwd + this.deps.sep;
    // Windows はパスの大小を区別しないので、ドライブ文字の違いなどで相対にできないことを避ける
    const fold = (s: string): string => (this.deps.sep === '\\' ? s.toLowerCase() : s);
    return fold(path).startsWith(fold(prefix)) ? path.slice(prefix.length) : path;
  }
}

/** タスクが参照しているスナップショットのハッシュ */
function hashesOf(task: Task): string[] {
  return task.turns.flatMap((turn) =>
    turn.changes.flatMap((c) => [c.before, c.after].filter((h): h is string => h !== undefined))
  );
}

/** 変更前に戻せるか。新規作成は消せばよく、それ以外は変更前の内容が要る */
function canRevert(change: FileChange): boolean {
  return change.kind === 'created' || change.before !== undefined;
}

/** スナップショットを消したタスクでは、戻せない */
function assertNotPruned(task: Task | undefined): void {
  if (task?.snapshotsPrunedAt !== undefined) {
    throw new Error(
      `Saved file contents of task "${task.id}" were removed after the retention period`
    );
  }
}
