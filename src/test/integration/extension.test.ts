import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { TestApi } from '../../extension';

// out/test/integration から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

interface Manifest {
  name: string;
  publisher: string;
  contributes?: { commands?: { command: string }[] };
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Manifest;
}

function extensionId(): string {
  const manifest = readManifest();
  return manifest.publisher + '.' + manifest.name;
}

/**
 * 起動時に Claude Code を起動するのは利用枠の取得だけにする（NFR-9）。
 * 画面を開く前の状態を見るので、ほかのテストより先に走るこのファイルに置く（順は .vscode-test.mjs の files で決める）。
 * ボードは次の起動で復元されないので、開くのはボードにする（サイドバーは開いたまま残り、次の実行で失敗する）
 */
suite('起動時の取得', () => {
  async function until(check: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (check()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('待ちきれなかった: ' + what);
  }

  test('起動時は利用枠だけを取り、モデルとコマンドの一覧は画面を開いた時に取る', async () => {
    const extension = vscode.extensions.getExtension<{ testApi?: TestApi }>(extensionId());
    assert.ok(extension, '拡張機能が見つからない: ' + extensionId());
    const t = (await extension.activate()).testApi;
    assert.ok(t, 'testApi が無い。FOREMAN_SCRIPTED_RUNNER=1 で起動しているか');

    await until(() => t.requests.usage > 0, '利用枠の取得');
    assert.strictEqual(t.requests.models, 0, 'モデルの一覧を起動時に取った');
    assert.strictEqual(t.requests.commands, 0, 'コマンドの一覧を起動時に取った');

    await vscode.commands.executeCommand('foreman.openBoard');
    await until(() => t.requests.models > 0 && t.requests.commands > 0, '一覧の取得');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});

suite('Extension', () => {
  test('拡張機能が読み込まれ、有効化できる', async () => {
    const extension = vscode.extensions.getExtension(extensionId());
    assert.ok(extension, '拡張機能が見つからない: ' + extensionId());
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test('package.json に書いたコマンドが、すべて登録されている', async () => {
    await vscode.extensions.getExtension(extensionId())?.activate();
    const registered = await vscode.commands.getCommands(true);
    const declared = (readManifest().contributes?.commands ?? []).map((c) => c.command);
    assert.ok(declared.length > 0, 'package.json にコマンドが無い');
    assert.deepStrictEqual(
      declared.filter((command) => !registered.includes(command)),
      [],
      '登録されていないコマンド'
    );
  });
});
