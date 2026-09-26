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
});
