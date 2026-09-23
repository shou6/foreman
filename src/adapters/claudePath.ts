import * as path from 'path';

export interface ClaudePathEnv {
  platform: string;
  home: string;
  /** PATH を区切った一覧 */
  pathEntries: string[];
  /** 設定 foreman.claudePath の値 */
  configured?: string;
  exists: (file: string) => boolean;
}

export type ClaudePathResult =
  | { path: string; source: 'setting' | 'path' | 'default' }
  | { error: 'setting-not-found'; path: string }
  | { error: 'not-found' };

/** npm の shim（claude.cmd）の隣にある、実体の JS */
const NPM_CLI_JS = ['node_modules', '@anthropic-ai', 'claude-code', 'cli.js'];

/**
 * ユーザーの claude CLI の場所を決める（FR-CONFIG-1）。
 * 設定 → PATH → native インストールの既定の場所の順。
 * Windows の claude.cmd は spawn できないので、隣の cli.js に読み替える
 */
export function resolveClaudePath(env: ClaudePathEnv): ClaudePathResult {
  const win = env.platform === 'win32';
  const p = win ? path.win32 : path.posix;

  if (env.configured !== undefined && env.configured !== '') {
    return env.exists(env.configured)
      ? { path: env.configured, source: 'setting' }
      : { error: 'setting-not-found', path: env.configured };
  }

  for (const dir of env.pathEntries) {
    if (dir === '') {
      continue;
    }
    if (win) {
      const exe = p.join(dir, 'claude.exe');
      if (env.exists(exe)) {
        return { path: exe, source: 'path' };
      }
      const cliJs = p.join(dir, ...NPM_CLI_JS);
      if (env.exists(p.join(dir, 'claude.cmd')) && env.exists(cliJs)) {
        return { path: cliJs, source: 'path' };
      }
    } else {
      const bin = p.join(dir, 'claude');
      if (env.exists(bin)) {
        return { path: bin, source: 'path' };
      }
    }
  }

  const fallback = p.join(env.home, '.local', 'bin', win ? 'claude.exe' : 'claude');
  if (env.exists(fallback)) {
    return { path: fallback, source: 'default' };
  }
  return { error: 'not-found' };
}
