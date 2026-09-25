/**
 * 公開パッケージ（VSIX）に入るファイルが、意図したものだけかを判定する（scripts/verify-package.js が使う）。
 * 入ってよいファイルは package.json の main と l10n の有無で変わる。宣言だけの拡張機能は main を持たない。
 */

export interface PackageManifest {
  main?: string;
  l10n?: string;
}

/** どの拡張機能でも入ってよいファイル */
const ALWAYS_ALLOWED = [
  /^package\.json$/,
  /^package\.nls(\.[a-z-]+)?\.json$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^LICENSE(\.txt|\.md)?$/,
  /^resources\/[\w.-]+\.(png|svg)$/,
];

/** どの拡張機能でも入っていなければならないファイル */
const ALWAYS_REQUIRED = ['package.json', 'README.md', 'LICENSE', 'resources/icon.png'];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ./dist/extension.js → dist/extension.js */
function normalize(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** vsce ls の出力から、ファイルの一覧だけを取り出す */
export function parseVsceLs(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter((line) => line !== '' && !line.startsWith('>') && !/^(INFO|WARNING)\b/.test(line));
}

export function checkPackageFiles(
  files: string[],
  manifest: PackageManifest
): { unexpected: string[]; missing: string[] } {
  const allowed = [...ALWAYS_ALLOWED];
  const required = [...ALWAYS_REQUIRED];
  if (manifest.main) {
    const main = normalize(manifest.main);
    allowed.push(new RegExp('^' + escapeRegExp(main) + '$'));
    required.push(main);
    // main と同じフォルダの .js と .css は Webview のバンドル、.ttf はそのアイコンのフォントなので入れてよい
    const dir = main.replace(/\/[^/]*$/, '');
    allowed.push(new RegExp('^' + escapeRegExp(dir) + '/[\\w.-]+\\.(js|css|ttf)$'));
  }
  if (manifest.l10n) {
    const dir = normalize(manifest.l10n).replace(/\/$/, '');
    allowed.push(new RegExp('^' + escapeRegExp(dir) + '/bundle\\.l10n(\\.[a-z-]+)?\\.json$'));
  }
  return {
    unexpected: files.filter((file) => !allowed.some((pattern) => pattern.test(file))),
    missing: required.filter((file) => !files.includes(file)),
  };
}

/**
 * 手元だけで使う文書と設定。公開リポジトリには入れず、foreman-docs（非公開）で管理する。
 * 公開側の無視は .gitignore ではなく .git/info/exclude に書くので、追跡されていないことをここで検査する
 */
const PRIVATE_PATHS = ['docs/', 'CLAUDE.md', '.claude/', '.automation/', 'spikes/'];

/** 追跡されているファイルのうち、手元だけの文書と設定に当たるもの */
export function privateFilesTracked(trackedFiles: string[]): string[] {
  return trackedFiles
    .map(normalize)
    .filter((file) =>
      PRIVATE_PATHS.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p))
    );
}
