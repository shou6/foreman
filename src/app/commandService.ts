import type { SlashCommandInfo } from '../domain/slashCommands';
import type { CommandCatalog } from '../ports/commandCatalog';

/**
 * Claude Code のスラッシュコマンドとスキルの一覧。起動後に 1 回だけ取得して覚えておく。
 * 取得するまでと、取得に失敗した時は空（プリセットだけが候補に出る）
 */
export class CommandService {
  private list: SlashCommandInfo[] = [];
  private loading: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly catalog: CommandCatalog,
    private readonly onError?: (error: unknown) => void
  ) {}

  current(): SlashCommandInfo[] {
    return this.list;
  }

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 一覧を取得する。2 回目以降は最初の取得を待つだけ */
  load(cwd: string): Promise<void> {
    this.loading ??= this.fetch(cwd);
    return this.loading;
  }

  private async fetch(cwd: string): Promise<void> {
    try {
      this.list = await this.catalog.list(cwd);
    } catch (error) {
      this.onError?.(error);
      return;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }
}
