import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// out/test/unit から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

/** 有効化のタイミング（NFR-9） */
suite('有効化のタイミング', () => {
  test('VS Code の起動の完了後に有効化する（画面を開く前からステータスバーに利用枠を出す）', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      activationEvents?: string[];
    };
    assert.ok(pkg.activationEvents?.includes('onStartupFinished'));
  });

  test('ステータスバーに利用枠を出すかの設定があり、既定は出す', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      contributes: {
        configuration: { properties: Record<string, { type: string; default: unknown }> };
      };
    };
    const setting = pkg.contributes.configuration.properties['foreman.planUsage.showInStatusBar'];
    assert.ok(setting, 'foreman.planUsage.showInStatusBar が無い');
    assert.strictEqual(setting.type, 'boolean');
    assert.strictEqual(setting.default, true);
  });
});

suite('worktree の準備の設定', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    contributes: {
      configuration: { properties: Record<string, { type: string; default: unknown }> };
    };
  };
  const properties = pkg.contributes.configuration.properties;

  test('コピーするファイルの glob の一覧があり、既定は空', () => {
    assert.strictEqual(properties['foreman.worktreeCopyFiles']?.type, 'array');
    assert.deepStrictEqual(properties['foreman.worktreeCopyFiles']?.default, []);
  });

  test('準備のコマンドがあり、既定は空', () => {
    assert.strictEqual(properties['foreman.worktreeSetupCommand']?.type, 'string');
    assert.strictEqual(properties['foreman.worktreeSetupCommand']?.default, '');
  });
});
