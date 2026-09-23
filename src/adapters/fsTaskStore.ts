import * as fs from 'fs/promises';
import * as path from 'path';
import type { Task } from '../domain/task';
import type { TaskStore } from '../ports/taskStore';

/**
 * タスクを <dir>/<id>.json に 1 つずつ保存する（実装計画書 4.5）。
 * 一時ファイルに書いてから rename し、途中で落ちても壊れないようにする
 */
export class FsTaskStore implements TaskStore {
  constructor(private readonly dir: string) {}

  async list(): Promise<Task[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const tasks: Task[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const task = await this.read(path.join(this.dir, name));
      if (task !== undefined) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  async load(id: string): Promise<Task | undefined> {
    return this.read(this.file(id));
  }

  async save(task: Task): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.file(task.id);
    const temp = file + '.' + process.pid + '.tmp';
    await fs.writeFile(temp, JSON.stringify(task, null, 2), 'utf8');
    await fs.rename(temp, file);
  }

  async delete(id: string): Promise<void> {
    await fs.rm(this.file(id), { force: true });
  }

  private file(id: string): string {
    return path.join(this.dir, id + '.json');
  }

  private async read(file: string): Promise<Task | undefined> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Task;
    } catch {
      return undefined;
    }
  }
}
