/**
 * 作業ディレクトリのファイルの読み書きと監視。
 * 実装は adapters/nodeFileSystem.ts、テストでは FakeFileSystem
 */
export interface FileSystem {
  /** 無ければ undefined */
  readFile(path: string): Promise<string | undefined>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  /**
   * dir 以下の変更（作成・変更・削除）を監視する。onChange には絶対パスが渡る。
   * 返り値で監視を止める
   */
  watch(dir: string, onChange: (path: string) => void): () => void;
}
