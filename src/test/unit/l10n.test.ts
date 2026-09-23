import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { extractL10nStrings, findUntranslatableCalls } from '../support/l10nStrings';

// out/test/unit から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as Record<string, unknown>;
}

suite('extractL10nStrings', () => {
  test('vscode.l10n.t と、翻訳関数 t に渡した文字列リテラルを取り出す', () => {
    const source = [
      "vscode.l10n.t('Open a folder to analyze.');",
      "l10n.t('Install {0} extensions?', count);",
      "t('Detected Stack')",
      't(\n  "Continue and Don\'t Ask Again"\n)',
      "label: t('It\\'s fine'),",
    ].join('\n');
    assert.deepStrictEqual(extractL10nStrings(source), [
      'Open a folder to analyze.',
      'Install {0} extensions?',
      'Detected Stack',
      "Continue and Don't Ask Again",
      "It's fine",
    ]);
  });

  test('t で終わる別の関数や、プロパティの呼び出しは拾わない', () => {
    const source = "format('x'); assert('y'); obj.emit('z'); result.split('w');";
    assert.deepStrictEqual(extractL10nStrings(source), []);
  });

  test('重複は 1 つにまとめる', () => {
    assert.deepStrictEqual(extractL10nStrings("t('A'); t('A'); t('B')"), ['A', 'B']);
  });
});

suite('findUntranslatableCalls', () => {
  test('文字列を + でつないで渡している呼び出しを見つける', () => {
    const source = "vscode.l10n.t('Installed ' + count); t('ok'); t(`template`);";
    assert.strictEqual(findUntranslatableCalls(source).length, 2);
  });

  test('単一の文字列リテラルだけなら空', () => {
    assert.deepStrictEqual(findUntranslatableCalls("t('a', x); vscode.l10n.t(\n'b'\n)"), []);
  });
});

suite('日本語の翻訳', () => {
  const files = sourceFiles(path.join(ROOT, 'src'));
  const sources = files.map((file) => fs.readFileSync(file, 'utf8'));

  test('翻訳関数には単一の文字列リテラルだけを渡している', () => {
    const bad = files.flatMap((file, i) =>
      findUntranslatableCalls(sources[i]).map((call) => path.basename(file) + ': ' + call)
    );
    assert.deepStrictEqual(bad, []);
  });

  test('ソース中の翻訳対象の文字列すべてに、日本語訳がある', () => {
    const bundle = readJson('l10n/bundle.l10n.ja.json');
    const strings = [...new Set(sources.flatMap(extractL10nStrings))];
    assert.ok(strings.length > 0, '翻訳対象の文字列を 1 つも抽出できない');
    const missing = strings.filter((s) => typeof bundle[s] !== 'string' || bundle[s] === '');
    assert.deepStrictEqual(missing, []);
  });

  test('翻訳ファイルに、もう使われていない文字列が残っていない', () => {
    const bundle = readJson('l10n/bundle.l10n.ja.json');
    const strings = new Set(sources.flatMap(extractL10nStrings));
    assert.deepStrictEqual(
      Object.keys(bundle).filter((key) => !strings.has(key)),
      []
    );
  });

  test('翻訳しても {0} などの差し込み位置が失われていない', () => {
    const bundle = readJson('l10n/bundle.l10n.ja.json');
    for (const [english, japanese] of Object.entries(bundle)) {
      const placeholders = (text: string): string[] => (text.match(/\{\d+\}/g) ?? []).sort();
      assert.deepStrictEqual(placeholders(String(japanese)), placeholders(english), english);
    }
  });

  test('package.json の %key% はすべて、英語と日本語の両方に定義がある', () => {
    const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const keys = [...new Set([...packageJson.matchAll(/"%([^%"]+)%"/g)].map((m) => m[1]))];
    assert.ok(keys.length > 0, 'package.json が %key% を使っていない');
    const english = readJson('package.nls.json');
    const japanese = readJson('package.nls.ja.json');
    assert.deepStrictEqual(
      keys.filter((key) => typeof english[key] !== 'string'),
      [],
      'package.nls.json に無い'
    );
    assert.deepStrictEqual(
      keys.filter((key) => typeof japanese[key] !== 'string'),
      [],
      'package.nls.ja.json に無い'
    );
  });

  test('翻訳ファイルが公開パッケージに含まれ、package.json が l10n の場所を指している', () => {
    const pkg = readJson('package.json') as { files?: string[]; l10n?: string };
    assert.strictEqual(pkg.l10n, './l10n');
    for (const entry of ['l10n/**', 'package.nls.json', 'package.nls.ja.json']) {
      assert.ok((pkg.files ?? []).includes(entry), entry + ' が files に無い');
    }
  });
});
