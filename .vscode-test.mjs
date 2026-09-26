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
  // extension.test.js を先に走らせる（画面を開く前の状態を確かめるテストがある）。
  // glob の順は決まっていないので名前で先頭に置く。重なった分は test-cli が 1 つにまとめる
  files: ['out/test/integration/extension.test.js', 'out/test/integration/**/*.test.js'],
  // 既定のリポジトリ直下だと、GitHub Actions の macOS でソケットのパスが 103 文字の上限を超え、
  // VS Code が EINVAL で起動できなかった。一時ディレクトリの下に短い名前で作る
  launchArgs: [...testLaunchArgs(), ...override.launchArgs],
  // Claude を起動せず、台本の Runner で流れを確かめる（src/test/integration/scenarios.test.ts）
  env: { FOREMAN_SCRIPTED_RUNNER: '1' },
  skipExtensionDependencies: override.skipExtensionDependencies,
  // 依存する拡張機能が有効化の中で重い処理をすると、初回は mocha の既定の 2 秒を超える
  mocha: { timeout: 30_000 },
});
