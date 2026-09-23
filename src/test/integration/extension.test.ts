import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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
