// 手元だけの文書と設定（docs/、CLAUDE.md、.claude/、.automation/、spikes/。非公開の foreman-docs で管理）が、
// 公開リポジトリの index に入っていないことを確かめる。
// 公開側の無視は .git/info/exclude（手元だけの設定）なので、それが無い clone では git add -A で混ざりうる。
// pre-commit フックと npm run verify:package の両方から呼び、コミットができる前に止める。
// 使い方: node scripts/check-private-files.js（失敗なら終了コード 1）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function checkPrivateFiles() {
  const helperPath = path.join(root, 'out', 'tooling', 'verifyPackage.js');
  if (!fs.existsSync(helperPath)) {
    execFileSync('npm', ['run', 'compile-tests', '--silent'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
  }
  const { privateFilesTracked } = require(helperPath);
  // git ls-files は index を見るので、ステージした新しいファイルも含む
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/);
  const leaked = privateFilesTracked(tracked);
  if (leaked.length > 0) {
    console.error(
      'Private docs or settings are staged or tracked in the public repository (they belong to foreman-docs):\n  ' +
        leaked.join('\n  ') +
        '\n\nUnstage them (git rm --cached <path>) and add them to .git/info/exclude.'
    );
    return false;
  }
  return true;
}

module.exports = { checkPrivateFiles };

if (require.main === module) {
  process.exit(checkPrivateFiles() ? 0 : 1);
}
