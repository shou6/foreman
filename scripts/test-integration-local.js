// 手元で統合テストを動かす。
// 使い方: npm run test:integration:local
//
// このワークスペースを VS Code で開いていると、npm test が依存する拡張機能（extensionDependencies）を
// .vscode-test/extensions に入れる時に EPERM で失敗する。そこで一時ディレクトリに入れてから、
// そのディレクトリを使って統合テストを実行する。CI では npm test をそのまま使う。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function run(title, commandLine, options = {}) {
  console.log('\n' + title + ': ' + commandLine);
  // Windows では npm と code の実体が .cmd なので、シェル経由で 1 行の文字列として渡す
  const result = spawnSync(commandLine, { cwd: root, stdio: 'inherit', shell: true, ...options });
  if (result.status !== 0) {
    console.error('\n' + title + ' が失敗しました。');
    process.exit(result.status ?? 1);
  }
}

async function main() {
  run('テストのコンパイル', 'npm run compile-tests');

  const {
    EXTENSIONS_DIR_ENV,
    installDependencyArgs,
    localCliUserDataDir,
    localExtensionsDir,
  } = require(path.join(root, 'out', 'tooling', 'localIntegration.js'));
  const { toShellCommand } = require(path.join(root, 'out', 'tooling', 'tryExtension.js'));
  const {
    downloadAndUnzipVSCode,
    resolveCliArgsFromVSCodeExecutablePath,
  } = require('@vscode/test-electron');

  // npm test と同じく .vscode-test に VS Code を用意する（取得済みなら再利用される）
  const vscodePath = await downloadAndUnzipVSCode();
  // reuseMachineInstall を指定すると、.vscode-test/extensions を指す既定の引数を付けない
  const [cli] = resolveCliArgsFromVSCodeExecutablePath(vscodePath, { reuseMachineInstall: true });

  const extensionsDir = localExtensionsDir();
  const args = installDependencyArgs(manifest, extensionsDir, localCliUserDataDir());
  if (args.length > 0) {
    run(
      '依存する拡張機能を一時ディレクトリに入れる',
      toShellCommand({ title: '', command: path.relative(root, cli), args })
    );
  }

  run('統合テスト', 'npx vscode-test', {
    env: { ...process.env, [EXTENSIONS_DIR_ENV]: extensionsDir },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
