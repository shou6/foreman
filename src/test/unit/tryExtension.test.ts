import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildTrySteps,
  extensionId,
  needsShell,
  toShellCommand,
  TryStep,
  vsixFileName,
} from '../../tooling/tryExtension';

// out/test/unit から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

const MANIFEST = { name: 'my-ext', version: '1.2.3', publisher: 'someone' };

suite('vsixFileName', () => {
  test('vsce が出すファイル名と同じ形にする', () => {
    assert.strictEqual(vsixFileName(MANIFEST), 'my-ext-1.2.3.vsix');
  });

  test('実際の package.json から作ったファイル名が、vsce の出力と一致する', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    assert.strictEqual(
      vsixFileName(manifest),
      manifest.name + '-' + manifest.version + '.vsix',
      'バージョンを上げた時にファイル名がついてこないと、古い VSIX を入れてしまう'
    );
  });
});

suite('extensionId', () => {
  test('publisher.name の形にする', () => {
    assert.strictEqual(extensionId(MANIFEST), 'someone.my-ext');
  });
});

suite('needsShell', () => {
  /**
   * Windows では npm も code も実体が .cmd で、Node 18.20.2 以降は
   * spawn が .cmd を直接起動できない（EINVAL。CVE-2024-27980 の対応）。
   */
  test('Windows だけシェルを経由する', () => {
    assert.strictEqual(needsShell('win32'), true);
    assert.strictEqual(needsShell('darwin'), false);
    assert.strictEqual(needsShell('linux'), false);
  });
});

suite('toShellCommand', () => {
  test('コマンドと引数を 1 つの文字列にする', () => {
    const step: TryStep = { title: 't', command: 'npm', args: ['run', 'test:unit'] };
    assert.strictEqual(toShellCommand(step), 'npm run test:unit');
  });

  test('空白やシェルの特殊文字を含む引数は、そのまま渡さず例外にする', () => {
    // シェル経由では引数がエスケープされない。引用が要るものが来たら気付けるようにする
    for (const arg of ['with space', 'a&b', 'a|b', 'a>b', 'a"b', "a'b", 'a;b', 'a$b', 'a`b']) {
      assert.throws(
        () => toShellCommand({ title: 't', command: 'code', args: [arg] }),
        new RegExp(''),
        arg
      );
    }
  });
});

suite('buildTrySteps', () => {
  // スイートの定義時ではなく test の中で呼ぶ。定義時に失敗すると mocha ごと落ちて結果が出ない
  const steps = (): TryStep[] => buildTrySteps(MANIFEST);

  test('単体テスト、VSIX 生成、中身の検査、アンインストール、インストールの順に並べる', () => {
    assert.deepStrictEqual(steps().map(toShellCommand), [
      'npm run test:unit',
      'npm run vsix',
      'node scripts/verify-package.js',
      'code --uninstall-extension someone.my-ext',
      'code --install-extension my-ext-1.2.3.vsix --force',
    ]);
  });

  test('アンインストールだけは失敗を許す（初回は入っていないため）', () => {
    const allowFailure = steps()
      .filter((step) => step.allowFailure)
      .map((step) => step.args[0]);
    assert.deepStrictEqual(allowFailure, ['--uninstall-extension']);
  });

  test('どの手順にも、何をしているかが分かる見出しを付ける', () => {
    for (const step of steps()) {
      assert.ok(step.title.trim().length > 0, JSON.stringify(step));
    }
  });

  test('実際の package.json でも、引用が要る引数が出ない', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      publisher?: string;
    };
    for (const step of buildTrySteps(manifest)) {
      assert.doesNotThrow(() => toShellCommand(step), JSON.stringify(step));
    }
  });
});

suite('package.json: try スクリプト', () => {
  test('npm run try で scripts/try-extension.js を実行する', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    assert.match(pkg.scripts?.try ?? '', /scripts\/try-extension\.js/);
  });
});
