import type { Task } from '../domain/task';
import type { TaskStore } from '../ports/taskStore';

/**
 * メモリ上に持つだけの TaskStore。保存のたびに複製し、参照の共有で壊れないようにする。
 * M5 で FsTaskStore に置き換えるまでの拡張機能の保存先でもあり、テストのフェイクでもある
 */
export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();

  async list(): Promise<Task[]> {
    return [...this.tasks.values()].map(clone);
  }

  async load(id: string): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    return task === undefined ? undefined : clone(task);
  }

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, clone(task));
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }
}

function clone(task: Task): Task {
  return structuredClone(task);
}
