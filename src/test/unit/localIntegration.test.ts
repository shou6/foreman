import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  EXTENSIONS_DIR_ENV,
  extensionsDirOverride,
  installDependencyArgs,
  localCliUserDataDir,
  localExtensionsDir,
} from '../../tooling/localIntegration';

// out/test/unit から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

/**
 * 手元で統合テストを動かすための手順（npm run test:integration:local）。
 * このワークスペースを VS Code で開いていると、.vscode-test/extensions への extensionDependencies の
 * インストールがフォルダの rename で EPERM になる（ワークスペースの外なら成功する）。
 * そこで依存する拡張機能を一時ディレクトリに入れ、統合テストはそこを使うようにする。
 */
suite('localExtensionsDir / localCliUserDataDir', () => {
  test('一時ディレクトリの下に置く（ワークスペースの外）', () => {
    assert.strictEqual(localExtensionsDir('/tmp'), path.join('/tmp', 'vsct-ext'));
    assert.strictEqual(localCliUserDataDir('/tmp'), path.join('/tmp', 'vsct-cli'));
  });

  test('インストール用の user-data-dir は、テストの実行中の VS Code と共有しない', () => {
    assert.notStrictEqual(localCliUserDataDir('/tmp'), path.join('/tmp', 'vsct'));
  });
});

suite('installDependencyArgs', () => {
  test('extensionDependencies をすべて、指定したディレクトリに入れる', () => {
    const manifest = { extensionDependencies: ['a.one', 'b.two'] };
    assert.deepStrictEqual(installDependencyArgs(manifest, '/tmp/ext', '/tmp/cli'), [
      '--extensions-dir',
      '/tmp/ext',
      '--user-data-dir',
      '/tmp/cli',
      '--install-extension',
      'a.one',
      '--install-extension',
      'b.two',
    ]);
  });

  test('依存が無ければ空（インストールしない）', () => {
    assert.deepStrictEqual(installDependencyArgs({}, '/tmp/ext', '/tmp/cli'), []);
  });
});

suite('extensionsDirOverride', () => {
  test('環境変数が無ければ何も変えない（CI と npm test はこれまでどおり）', () => {
    assert.deepStrictEqual(extensionsDirOverride({}), {
      launchArgs: [],
      skipExtensionDependencies: false,
    });
  });

  test('環境変数があれば、そのディレクトリの拡張機能を使い、依存の自動インストールを止める', () => {
    assert.deepStrictEqual(extensionsDirOverride({ [EXTENSIONS_DIR_ENV]: '/tmp/ext' }), {
      launchArgs: ['--extensions-dir', '/tmp/ext'],
      skipExtensionDependencies: true,
    });
  });

  test('空文字は無いものとして扱う', () => {
    assert.deepStrictEqual(extensionsDirOverride({ [EXTENSIONS_DIR_ENV]: '' }), {
      launchArgs: [],
      skipExtensionDependencies: false,
    });
  });
});

suite('npm run test:integration:local', () => {
  test('package.json から scripts/test-integration-local.js を実行する', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    assert.match(
      pkg.scripts?.['test:integration:local'] ?? '',
      /scripts\/test-integration-local\.js/
    );
  });

  test('.vscode-test.mjs が extensionsDirOverride を使っている', () => {
    const config = fs.readFileSync(path.join(ROOT, '.vscode-test.mjs'), 'utf8');
    assert.ok(config.includes('extensionsDirOverride'), config);
  });
});
