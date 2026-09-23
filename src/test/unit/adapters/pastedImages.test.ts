import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pastedImageName, savePastedImage } from '../../../adapters/pastedImages';

suite('貼り付けた画像の保存', () => {
  test('ファイル名は時刻と種類から決める。知らない種類は png にする', () => {
    const at = new Date('2026-09-24T07:30:00.123Z');
    assert.strictEqual(pastedImageName(at, 'image/png'), 'paste-20260924-073000-123.png');
    assert.strictEqual(pastedImageName(at, 'image/jpeg'), 'paste-20260924-073000-123.jpg');
    assert.strictEqual(pastedImageName(at, 'image/gif'), 'paste-20260924-073000-123.gif');
    assert.strictEqual(pastedImageName(at, 'image/webp'), 'paste-20260924-073000-123.webp');
    assert.strictEqual(pastedImageName(at, 'image/x-unknown'), 'paste-20260924-073000-123.png');
  });

  test('base64 の中身をフォルダに書き、パスを返す。フォルダが無ければ作る', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-paste-')), 'attachments');
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const saved = await savePastedImage(dir, 'image/png', bytes.toString('base64'), {
      now: new Date('2026-09-24T07:30:00.000Z'),
    });
    assert.strictEqual(path.basename(saved), 'paste-20260924-073000-000.png');
    assert.deepStrictEqual([...fs.readFileSync(saved)], [...bytes]);
  });
});
