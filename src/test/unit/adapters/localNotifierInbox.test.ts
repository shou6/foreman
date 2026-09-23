import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inboxDirOf, writeToInbox } from '../../../adapters/localNotifierInbox';

suite('Local Notifier の inbox', () => {
  test('一時ファイルに書いてから本来の名前に付け替える（拡張機能が途中のファイルを読まないように）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-inbox-'));
    const name = await writeToInbox(
      dir,
      { title: 'Foreman', message: 'done', level: 'success', source: 'Foreman' },
      { now: 1700000000000, pid: 42 }
    );
    assert.strictEqual(name, '1700000000000-42.json');
    const files = fs.readdirSync(dir);
    assert.deepStrictEqual(files, ['1700000000000-42.json']);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')), {
      title: 'Foreman',
      message: 'done',
      level: 'success',
      source: 'Foreman',
    });
  });

  test('inbox のフォルダが無ければ作る', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-inbox-')), 'inbox');
    await writeToInbox(dir, { preset: 'done' }, { now: 1, pid: 2 });
    assert.ok(fs.existsSync(path.join(dir, '1-2.json')));
  });

  test('inbox の場所: 設定があればそれ、無ければ globalStorage の隣の Local Notifier のフォルダ', () => {
    assert.strictEqual(
      inboxDirOf({ configured: 'D:\\inbox', globalStorage: 'C:\\gs\\shou6.foreman', sep: '\\' }),
      'D:\\inbox'
    );
    assert.strictEqual(
      inboxDirOf({ configured: '', globalStorage: 'C:\\gs\\shou6.foreman', sep: '\\' }),
      'C:\\gs\\shou6.vscode-local-notifier\\inbox'
    );
  });
});
