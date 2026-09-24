import { FALLBACK_MODELS, modelsFromSdk, type ModelList } from '../domain/models';
import type { ModelCatalog } from '../ports/modelCatalog';

/**
 * モデルの選択肢。拡張機能の起動後に 1 回だけ Claude Code から一覧を取得して覚えておく。
 * 取得するまでと、取得に失敗した時は固定の一覧を使う
 */
export class ModelService {
  private list: ModelList = { models: FALLBACK_MODELS, defaultModel: undefined };
  private loading: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly catalog: ModelCatalog,
    private readonly onError?: (error: unknown) => void
  ) {}

  current(): ModelList {
    return this.list;
  }

  /** 一覧が入れ替わった時に呼ぶ。返り値で登録を外す */
  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 一覧を取得する。2 回目以降は最初の取得を待つだけ */
  load(): Promise<void> {
    this.loading ??= this.fetch();
    return this.loading;
  }

  private async fetch(): Promise<void> {
    try {
      this.list = modelsFromSdk(await this.catalog.list());
    } catch (error) {
      this.onError?.(error);
      return;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }
}
