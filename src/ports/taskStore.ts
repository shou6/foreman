import type { Task } from '../domain/task';

/** タスクの保存。実装は adapters/fsTaskStore.ts、テストでは InMemoryTaskStore */
export interface TaskStore {
  list(): Promise<Task[]>;
  load(id: string): Promise<Task | undefined>;
  save(task: Task): Promise<void>;
  delete(id: string): Promise<void>;
}
