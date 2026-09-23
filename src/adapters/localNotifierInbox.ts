import * as fs from 'fs/promises';
import * as path from 'path';

/** Local Notifier（shou6.vscode-local-notifier）の inbox に置く通知 */
export interface InboxNotification {
  preset?: 'done' | 'waiting' | 'error' | string;
  title?: string;
  message?: string;
  project?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  source?: string;
}

const LOCAL_NOTIFIER_ID = 'shou6.vscode-local-notifier';

/**
 * inbox のフォルダ。Local Notifier の設定 localNotifier.inboxPath があればそれ。
 * 無ければ、VS Code が拡張機能ごとに用意する globalStorage の隣（Local Notifier の「すべてのワークスペース」の inbox）
 */
export function inboxDirOf(input: {
  configured: string;
  /** Foreman 自身の globalStorage のパス */
  globalStorage: string;
  sep: string;
}): string {
  const configured = input.configured.trim();
  if (configured !== '') {
    return configured;
  }
  const parent = input.globalStorage
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .slice(0, -1);
  return [...parent, LOCAL_NOTIFIER_ID, 'inbox'].join(input.sep);
}

/**
 * 通知を 1 つ書く。Local Notifier の hook と同じく、一時ファイルに書いてから本来の名前に付け替える。
 * 返り値はファイル名
 */
export async function writeToInbox(
  dir: string,
  notification: InboxNotification,
  ids: { now: number; pid: number }
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const name = `${ids.now}-${ids.pid}.json`;
  const temp = path.join(dir, `.tmp-${ids.now}-${ids.pid}.json`);
  await fs.writeFile(temp, JSON.stringify(notification), 'utf8');
  await fs.rename(temp, path.join(dir, name));
  return name;
}
