import { execFile, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** 探さないフォルダ。.foreman にはほかのタスクの worktree がある */
const SKIPPED = ['.git', '.foreman'];

/** root の下で patterns（root からの相対の glob）に合うファイル。root からの相対パスで返す */
export async function findFiles(root: string, patterns: readonly string[]): Promise<string[]> {
  const found = new Set<string>();
  for await (const entry of fs.promises.glob([...patterns], {
    cwd: root,
    withFileTypes: true,
    exclude: (dirent) => dirent.isDirectory() && SKIPPED.includes(dirent.name),
  })) {
    if (entry.isFile()) {
      found.add(path.relative(root, path.join(entry.parentPath, entry.name)));
    }
  }
  return [...found];
}

/** from を to へコピーする。to のフォルダが無ければ作る */
export async function copyFile(from: string, to: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.copyFile(from, to);
}

/**
 * cwd でシェルのコマンドを実行する。出力は log へ流す。
 * 0 以外で終わるか、signal で中止すると失敗にする（中止はプロセスの子まで止める）
 */
export function runShell(
  cwd: string,
  command: string,
  options: { log: (text: string) => void; signal?: AbortSignal }
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new Error(`The setup command was cancelled: ${command}`));
      return;
    }
    // Windows では引数の配列と併用せず、1 行の文字列で渡す（Node がエスケープしないため）
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      // Windows 以外は、子も含めてまとめて止められるようにプロセスグループを分ける
      detached: process.platform !== 'win32',
    });
    let cancelled = false;
    const onAbort = (): void => {
      cancelled = true;
      killTree(child);
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (data: Buffer) => options.log(data.toString()));
    child.stderr?.on('data', (data: Buffer) => options.log(data.toString()));
    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(error);
    });
    child.on('close', (code, signal) => {
      options.signal?.removeEventListener('abort', onAbort);
      if (cancelled) {
        reject(new Error(`The setup command was cancelled: ${command}`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`The setup command failed (exit code ${code ?? signal}): ${command}`));
      }
    });
  });
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    execFile(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      () => {}
    );
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // 既に終わっている
  }
}
