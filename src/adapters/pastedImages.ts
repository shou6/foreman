import * as fs from 'fs/promises';
import * as path from 'path';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** 貼り付けた画像のファイル名。時刻（UTC）と種類から決め、知らない種類は png にする */
export function pastedImageName(at: Date, mime: string): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  const stamp =
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `-${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}` +
    `-${pad(at.getUTCMilliseconds(), 3)}`;
  return `paste-${stamp}.${EXTENSIONS[mime] ?? 'png'}`;
}

/** base64 の画像をフォルダに書き、そのパスを返す。フォルダが無ければ作る */
export async function savePastedImage(
  dir: string,
  mime: string,
  base64: string,
  options: { now?: Date } = {}
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, pastedImageName(options.now ?? new Date(), mime));
  await fs.writeFile(file, Buffer.from(base64, 'base64'));
  return file;
}
