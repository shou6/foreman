import * as assert from 'assert';
import { checkPackageFiles, parseVsceLs } from '../../tooling/verifyPackage';

const COMMON = ['package.json', 'README.md', 'LICENSE', 'resources/icon.png'];

suite('parseVsceLs', () => {
  test('vsce ls の出力から、ファイルの一覧だけを取り出す', () => {
    const output = [
      '> foreman@0.0.1 vscode:prepublish',
      '> npm run package',
      '',
      ' INFO  Files included in the VSIX:',
      'package.json',
      'dist\\extension.js',
      ' WARNING  LICENSE not found',
      '  README.md  ',
      '',
    ].join('\r\n');
    assert.deepStrictEqual(parseVsceLs(output), ['package.json', 'dist/extension.js', 'README.md']);
  });
});

suite('checkPackageFiles', () => {
  test('main と l10n があれば、エントリポイントと翻訳ファイルを入れてよく、エントリポイントは必須', () => {
    const manifest = { main: './dist/extension.js', l10n: './l10n' };
    assert.deepStrictEqual(
      checkPackageFiles([...COMMON, 'dist/extension.js', 'l10n/bundle.l10n.ja.json'], manifest),
      { unexpected: [], missing: [] }
    );
    assert.deepStrictEqual(checkPackageFiles(COMMON, manifest), {
      unexpected: [],
      missing: ['dist/extension.js'],
    });
  });

  test('main が無い（宣言だけの拡張機能）なら、エントリポイントを求めず、入っていたら意図しないもの', () => {
    assert.deepStrictEqual(checkPackageFiles(COMMON, {}), { unexpected: [], missing: [] });
    assert.deepStrictEqual(checkPackageFiles([...COMMON, 'dist/extension.js'], {}), {
      unexpected: ['dist/extension.js'],
      missing: [],
    });
  });

  test('l10n が無ければ、翻訳ファイルは意図しないもの', () => {
    assert.deepStrictEqual(checkPackageFiles([...COMMON, 'l10n/bundle.l10n.ja.json'], {}), {
      unexpected: ['l10n/bundle.l10n.ja.json'],
      missing: [],
    });
  });

  test('package.nls と CHANGELOG は入れてよい。ログやソースは意図しないもの', () => {
    const files = [
      ...COMMON,
      'package.nls.json',
      'package.nls.ja.json',
      'CHANGELOG.md',
      'logs/run.log',
      'src/extension.ts',
    ];
    assert.deepStrictEqual(checkPackageFiles(files, {}), {
      unexpected: ['logs/run.log', 'src/extension.ts'],
      missing: [],
    });
  });

  test('必須のファイル（package.json、README、LICENSE、アイコン）が無ければ知らせる', () => {
    assert.deepStrictEqual(checkPackageFiles(['package.json'], {}), {
      unexpected: [],
      missing: ['README.md', 'LICENSE', 'resources/icon.png'],
    });
  });
});
