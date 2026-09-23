// 公開パッケージ（VSIX）に入るファイルが、意図したものだけであることを確かめる。
// 使い方: npm run verify:package
//
// 実際に起きた問題: 除外リスト方式だった時、動作確認のログ（利用者のプロジェクトの技術スタックや
// 依存パッケージ名を含む）がパッケージに入っていた。公開したパッケージは取り消せないので、
// package.json の files（許可リスト）に加えて、vsce が実際に入れるファイルの一覧でも検査する。
// 入ってよいファイルの判定は out/tooling/verifyPackage.js（単体テスト済み）が行う。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'out', 'tooling', 'verifyPackage.js');
if (!fs.existsSync(helperPath)) {
  console.error('Run "npm run compile-tests" first (' + helperPath + ' is missing).');
  process.exit(1);
}
const { checkPackageFiles, parseVsceLs } = require(helperPath);

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vsce = path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce');
const output = execFileSync(process.execPath, [vsce, 'ls'], { cwd: root, encoding: 'utf8' });
const files = parseVsceLs(output);
const { unexpected, missing } = checkPackageFiles(files, manifest);

console.log('Files in the package (' + files.length + '):');
for (const file of files) {
  console.log('  ' + file);
}

if (unexpected.length > 0 || missing.length > 0) {
  if (unexpected.length > 0) {
    console.error('\nUnexpected files in the package:\n  ' + unexpected.join('\n  '));
  }
  if (missing.length > 0) {
    console.error('\nMissing from the package:\n  ' + missing.join('\n  '));
  }
  process.exit(1);
}
console.log('\nOK: the package contains only the expected files.');
