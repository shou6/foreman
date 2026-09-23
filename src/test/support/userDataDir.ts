import * as os from 'os';
import * as path from 'path';

/**
 * macOS の Unix ドメインソケットのパスの上限（sockaddr_un.sun_path）。
 * VS Code は user-data-dir の下に `<version>-main.sock` を作るので、そこまで含めて収める必要がある。
 */
export const SOCKET_PATH_LIMIT = 103;

/** VS Code が user-data-dir の下に作るソケットのファイル名のうち、最も長くなる形 */
const SOCKET_FILE = '1.100-main.sock';

/**
 * 統合テスト用の user-data-dir を決める（.vscode-test.mjs が使う）。
 *
 * 既定（リポジトリ直下の .vscode-test/user-data）だと、GitHub Actions の macOS では
 * ソケットのパスが 106 文字になり、VS Code が起動できずに EINVAL で落ちた。
 * 一時ディレクトリの下に短い名前で作ることで、どの環境でも上限に収まるようにする。
 */
export function testUserDataDir(tmpdir: string = os.tmpdir()): string {
  return path.join(tmpdir, 'vsct');
}

/** その user-data-dir で、ソケットのパスが上限に収まるか */
export function socketPathFits(userDataDir: string, limit = SOCKET_PATH_LIMIT): boolean {
  return path.join(userDataDir, SOCKET_FILE).length <= limit;
}

/**
 * VS Code に渡す起動引数。
 * `userDataDir` という設定項目は @vscode/test-cli に存在しないので、`launchArgs` で渡す
 * （存在しない項目を書いても、エラーにならずに黙って無視される）。
 */
export function testLaunchArgs(tmpdir: string = os.tmpdir()): string[] {
  return ['--user-data-dir', testUserDataDir(tmpdir)];
}
