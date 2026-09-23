// 直した拡張機能を手元の VS Code で試すまでを一度に行う。
// 使い方: npm run try
//
// 単体テスト → VSIX の生成 → パッケージの中身の検査 → 古い版のアンインストール → インストール。
// 統合テスト（npm test）は時間がかかるので含めない。コミット前には別途 npm test を通すこと。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// 手順の組み立ては out/ の実装を使う（単体テストで検証済み）。まだコンパイルされていなければ先に行う
const helperPath = path.join(root, 'out', 'tooling', 'tryExtension.js');
if (!fs.existsSync(helperPath)) {
  const compile = spawnSync('npm run compile-tests', {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (compile.status !== 0) {
    process.exit(compile.status ?? 1);
  }
}
const { buildTrySteps, extensionId, needsShell, toShellCommand } = require(helperPath);

const useShell = needsShell(process.platform);
const steps = buildTrySteps(manifest);

for (const [index, step] of steps.entries()) {
  const label = '[' + (index + 1) + '/' + steps.length + '] ' + step.title;
  const commandLine = toShellCommand(step);
  console.log('\n' + label + ': ' + commandLine);

  // シェルを使う時は 1 行で渡す（引数の配列と併用すると Node がエスケープせずに連結する）
  const result = useShell
    ? spawnSync(commandLine, { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync(step.command, step.args, { cwd: root, stdio: 'inherit' });

  if (result.error && result.error.code === 'ENOENT') {
    const hint = step.command.startsWith('code')
      ? ' VS Code の「シェルコマンド: PATH内に code コマンドをインストール」を実行してください。'
      : '';
    console.error('\n' + step.command + ' が見つかりません。' + hint);
    process.exit(1);
  }
  if (result.status !== 0 && !step.allowFailure) {
    console.error('\n' + label + ' が失敗しました。');
    process.exit(result.status ?? 1);
  }
  if (result.status !== 0) {
    console.log('  (まだ入っていないため、この手順は飛ばしました)');
  }
}

console.log(
  [
    '',
    '完了しました。VS Code を再起動すると新しい版が有効になります。',
    '（コマンドパレットの「開発者: ウィンドウの再読み込み」でも可）',
    '',
    '削除する時: code --uninstall-extension ' + extensionId(manifest),
  ].join('\n')
);
