import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// out/test/unit から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

/** 拡張機能の README の場所。テンプレートのうちは .template/ にあり、npm run init で直下に移る */
const README_DIR = fs.existsSync(path.join(ROOT, '.template')) ? '.template' : '.';

/**
 * 公開パッケージ（VSIX）に意図しないファイルを入れないための歯止め。
 * 元にしたプロジェクトで実際に起きた問題: 除外リスト方式（.vscodeignore）だった時、動作確認のログ
 * （logs/*.log）がパッケージに入っていた。公開したパッケージは取り消せないので、許可リスト方式に固定する。
 */
suite('公開パッケージの中身', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    files?: string[];
    main?: string;
  };

  test('package.json の files で、含めるものだけを列挙している（許可リスト方式）', () => {
    assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'files が無い');
  });

  test('.vscodeignore を置かない（files と併用できず、除外リスト方式に戻ってしまう）', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, '.vscodeignore')));
  });

  test('files に広すぎる指定や、含めてはいけないフォルダが無い', () => {
    for (const entry of pkg.files ?? []) {
      assert.ok(!/^(\*\*|\*|\.|\.\/)?\/?\**$/.test(entry), '広すぎる指定: ' + entry);
      assert.ok(
        !/^(logs|src|out|docs|scripts|node_modules|\.claude|\.automation|\.vscode|\.template)(\/|$)/.test(
          entry
        ),
        '含めてはいけない: ' + entry
      );
    }
  });

  // 宣言だけの拡張機能（npm run init -- ... --declarative）は main を持たない
  test('main があれば、エントリポイントは files に含まれている', () => {
    if (!pkg.main) {
      return;
    }
    const main = path.posix.normalize(pkg.main);
    assert.ok((pkg.files ?? []).includes(main), main + ' が files に無い');
  });
});

/** Marketplace に公開するための条件 */
suite('Marketplace 公開の準備', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    publisher?: string;
    license?: string;
    icon?: string;
    repository?: { url?: string };
    bugs?: { url?: string };
    files?: string[];
  };

  test('publisher、license、repository、bugs が設定されている', () => {
    assert.ok(manifest.publisher, 'publisher が無い');
    assert.strictEqual(manifest.license, 'MIT');
    const repository = 'github.com/' + manifest.publisher + '/' + manifest.name;
    assert.ok(
      (manifest.repository?.url ?? '').includes(repository),
      'repository が ' + repository + ' を指していない: ' + manifest.repository?.url
    );
    assert.match(manifest.bugs?.url ?? '', /\/issues$/);
  });

  test('アイコンは 128px 以上の PNG で、公開パッケージに含まれる（SVG は Marketplace が受け付けない）', () => {
    assert.ok(manifest.icon, 'icon が無い');
    const icon = fs.readFileSync(path.join(ROOT, manifest.icon ?? ''));
    // PNG の署名と、IHDR チャンクの幅・高さ
    assert.deepStrictEqual(
      [...icon.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );
    const width = icon.readUInt32BE(16);
    const height = icon.readUInt32BE(20);
    assert.ok(width >= 128 && height >= 128, width + 'x' + height);
    assert.strictEqual(width, height, '正方形でない');
    assert.ok(
      (manifest.files ?? []).some(
        (entry) =>
          entry === manifest.icon || entry === path.posix.dirname(manifest.icon ?? '') + '/**'
      ),
      'アイコンが files に含まれていない'
    );
  });

  test('CHANGELOG に、今のバージョンの項目がある', () => {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    assert.ok(
      changelog.includes('## [' + manifest.version + ']') ||
        changelog.includes('## ' + manifest.version),
      'CHANGELOG.md に ' + manifest.version + ' の項目が無い'
    );
  });

  test('バージョンは major.minor.patch の形（Marketplace は pre-release のタグを受け付けない）', () => {
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  });

  test('README と CHANGELOG に SVG の画像や http の画像が無い（Marketplace が拒否する）', () => {
    for (const file of [README_DIR + '/README.md', 'CHANGELOG.md']) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const images = [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]);
      for (const url of images) {
        // GitHub Actions のバッジだけは SVG でも Marketplace が受け付ける（vsce の isGitHubBadge と同じ条件）
        assert.ok(
          !/\.svg(\?|#|$)/i.test(url) || GITHUB_BADGE.test(url),
          file + ': SVG の画像: ' + url
        );
        assert.ok(!/^http:\/\//i.test(url), file + ': https でない画像: ' + url);
      }
    }
  });

  test('README（英日）の先頭に、CI の結果のバッジがある', () => {
    const repository = 'https://github.com/' + manifest.publisher + '/' + manifest.name;
    const badge =
      '[![CI](' +
      repository +
      '/actions/workflows/ci.yml/badge.svg)](' +
      repository +
      '/actions/workflows/ci.yml)';
    for (const file of ['README.md', 'README.ja.md']) {
      const text = fs.readFileSync(path.join(ROOT, README_DIR, file), 'utf8');
      const intro = text.slice(0, text.indexOf('\n## '));
      assert.ok(intro.includes(badge), file + ' に ' + badge + ' が無い');
    }
  });
});

/** vsce が SVG でも受け付ける GitHub Actions のバッジの URL */
const GITHUB_BADGE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(actions\/)?workflows\/.*badge\.svg/;

suite('Dependabot', () => {
  const read = (): string => fs.readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8');

  test('npm の依存と GitHub Actions を対象にしている', () => {
    const config = read();
    assert.match(config, /package-ecosystem:\s*["']?npm["']?/);
    assert.match(config, /package-ecosystem:\s*["']?github-actions["']?/);
  });

  test('@types/vscode は上げない（engines.vscode より新しいと vsce package が失敗する）', () => {
    assert.match(read(), /dependency-name:\s*["']?@types\/vscode["']?/);
  });

  test('コミットメッセージの接頭辞をコミット規約（chore）に合わせている', () => {
    const config = read();
    assert.match(config, /prefix:\s*["']?chore["']?/);
    assert.match(config, /prefix-development:\s*["']?chore["']?/);
  });
});
