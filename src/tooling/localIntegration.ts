import * as os from 'os';
import * as path from 'path';

/**
 * 手元で統合テストを動かすための手順（scripts/test-integration-local.js と .vscode-test.mjs が使う）。
 *
 * このワークスペースを VS Code で開いていると、@vscode/test-cli が extensionDependencies を
 * .vscode-test/extensions に入れる時のフォルダの rename が EPERM で失敗する（ワークスペースの外なら成功する）。
 * 依存する拡張機能を一時ディレクトリに入れておき、統合テストはそこを使う。
 */

/** 依存する拡張機能を入れたディレクトリを、統合テストに渡す環境変数 */
export const EXTENSIONS_DIR_ENV = 'VSCODE_TEST_EXTENSIONS_DIR';

/** 依存する拡張機能を入れるディレクトリ */
export function localExtensionsDir(tmpdir: string = os.tmpdir()): string {
  return path.join(tmpdir, 'vsct-ext');
}

/** インストールに使う VS Code の CLI の user-data-dir。テストの実行中の VS Code とは分ける */
export function localCliUserDataDir(tmpdir: string = os.tmpdir()): string {
  return path.join(tmpdir, 'vsct-cli');
}

/** VS Code の CLI に渡す、extensionDependencies をインストールする引数 */
export function installDependencyArgs(
  manifest: { extensionDependencies?: string[] },
  extensionsDir: string,
  userDataDir: string
): string[] {
  const dependencies = manifest.extensionDependencies ?? [];
  if (dependencies.length === 0) {
    return [];
  }
  return [
    '--extensions-dir',
    extensionsDir,
    '--user-data-dir',
    userDataDir,
    ...dependencies.flatMap((id) => ['--install-extension', id]),
  ];
}

/**
 * 環境変数でディレクトリを指定された時だけ、統合テストの設定を差し替える。
 * 指定が無ければ CI と npm test はこれまでどおり @vscode/test-cli が依存を入れる。
 */
export function extensionsDirOverride(env: Record<string, string | undefined>): {
  launchArgs: string[];
  skipExtensionDependencies: boolean;
} {
  const dir = env[EXTENSIONS_DIR_ENV];
  if (!dir) {
    return { launchArgs: [], skipExtensionDependencies: false };
  }
  return { launchArgs: ['--extensions-dir', dir], skipExtensionDependencies: true };
}
