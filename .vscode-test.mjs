import { createRequire } from 'module';
import { defineConfig } from '@vscode/test-cli';

// out/ は tsc が出す CommonJS なので、ESM のこのファイルからは createRequire で読む。
// pretest（npm run compile-tests）で必ず先にコンパイルされる。
const require = createRequire(import.meta.url);
let testLaunchArgs;
let extensionsDirOverride;
try {
  ({ testLaunchArgs } = require('./out/test/support/userDataDir.js'));
  ({ extensionsDirOverride } = require('./out/tooling/localIntegration.js'));
} catch {
  throw new Error('Run "npm run compile-tests" first (out/ is missing).');
}

// npm run test:integration:local の時だけ、一時ディレクトリに入れた依存する拡張機能を使う
const override = extensionsDirOverride(process.env);

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  // 既定のリポジトリ直下だと、GitHub Actions の macOS でソケットのパスが 103 文字の上限を超え、
  // VS Code が EINVAL で起動できなかった。一時ディレクトリの下に短い名前で作る
  launchArgs: [...testLaunchArgs(), ...override.launchArgs],
  skipExtensionDependencies: override.skipExtensionDependencies,
  // 依存する拡張機能が有効化の中で重い処理をすると、初回は mocha の既定の 2 秒を超える
  mocha: { timeout: 30_000 },
});
