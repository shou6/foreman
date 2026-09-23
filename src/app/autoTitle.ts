import type { Task } from '../domain/task';
import type { TaskService } from './taskService';

export interface AutoTitleDeps {
  /** 指示から短いタイトルを作る。作れなければ undefined */
  suggest: (prompt: string) => Promise<string | undefined>;
  /** 設定 foreman.autoTitle */
  enabled: () => boolean;
}

/**
 * タスクの作成後に、軽いモデルで短いタイトルを付ける。
 * 指示の先頭をそのまま使う初期のタイトルは長く、一覧で切れるため
 */
export class AutoTitle {
  constructor(
    private readonly service: TaskService,
    private readonly deps: AutoTitleDeps
  ) {}

  /** 作成直後に呼ぶ。ユーザーがタイトルを付けた時は何もしない。失敗しても元のまま */
  async onCreated(task: Task, userTitled = false): Promise<void> {
    if (userTitled || !this.deps.enabled()) {
      return;
    }
    const prompt = task.turns[0]?.prompt ?? task.title;
    let title: string | undefined;
    try {
      title = await this.deps.suggest(prompt);
    } catch {
      return;
    }
    if (title === undefined || title === '') {
      return;
    }
    await this.service.patch(task.id, (t) => ({ ...t, title }));
  }
}
