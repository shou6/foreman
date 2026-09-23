/**
 * 差分カード用のファイルの内容の保存。内容のハッシュを名前にし、同じ内容は 1 つだけ持つ。
 * 実装は adapters/fsSnapshotStore.ts、テストでは InMemorySnapshotStore
 */
export interface SnapshotStore {
  /** 内容を保存し、ハッシュを返す */
  save(content: string): Promise<string>;
  load(hash: string): Promise<string | undefined>;
  /** 保存しているハッシュの一覧（後片付け用） */
  list(): Promise<string[]>;
  delete(hash: string): Promise<void>;
}
