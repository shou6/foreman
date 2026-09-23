import * as assert from 'assert';
import { resolveClaudePath, type ClaudePathEnv } from '../../../adapters/claudePath';

function env(overrides: Partial<ClaudePathEnv> & { existing: string[] }): ClaudePathEnv {
  const existing = new Set(overrides.existing.map((p) => p.replace(/\\/g, '/')));
  return {
    platform: overrides.platform ?? 'win32',
    home: overrides.home ?? 'C:\\Users\\me',
    pathEntries: overrides.pathEntries ?? [],
    configured: overrides.configured,
    exists: (p) => existing.has(p.replace(/\\/g, '/')),
  };
}

suite('resolveClaudePath', () => {
  test('設定があり、そのファイルが存在すれば、それを使う', () => {
    const e = env({ configured: 'D:\\tools\\claude.exe', existing: ['D:/tools/claude.exe'] });
    assert.deepStrictEqual(resolveClaudePath(e), { path: 'D:\\tools\\claude.exe', source: 'setting' });
  });

  test('設定があっても存在しなければ、設定が誤りだと分かる形で返す', () => {
    const e = env({ configured: 'D:\\tools\\claude.exe', existing: [] });
    assert.deepStrictEqual(resolveClaudePath(e), {
      error: 'setting-not-found',
      path: 'D:\\tools\\claude.exe',
    });
  });

  test('Windows では PATH から claude.exe を探す', () => {
    const e = env({
      pathEntries: ['C:\\Windows', 'C:\\Users\\me\\.local\\bin'],
      existing: ['C:/Users/me/.local/bin/claude.exe'],
    });
    assert.deepStrictEqual(resolveClaudePath(e), {
      path: 'C:\\Users\\me\\.local\\bin\\claude.exe',
      source: 'path',
    });
  });

  test('PATH の claude.cmd（npm の shim）は起動できないので、隣の cli.js に読み替える', () => {
    const e = env({
      pathEntries: ['C:\\Users\\me\\AppData\\Roaming\\npm'],
      existing: [
        'C:/Users/me/AppData/Roaming/npm/claude.cmd',
        'C:/Users/me/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js',
      ],
    });
    assert.deepStrictEqual(resolveClaudePath(e), {
      path: 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
      source: 'path',
    });
  });

  test('macOS / Linux では PATH から claude を探す', () => {
    const e = env({
      platform: 'darwin',
      home: '/Users/me',
      pathEntries: ['/usr/local/bin', '/Users/me/.local/bin'],
      existing: ['/Users/me/.local/bin/claude'],
    });
    assert.deepStrictEqual(resolveClaudePath(e), {
      path: '/Users/me/.local/bin/claude',
      source: 'path',
    });
  });

  test('PATH に無ければ、native インストールの既定の場所を見る', () => {
    const e = env({ existing: ['C:/Users/me/.local/bin/claude.exe'] });
    assert.deepStrictEqual(resolveClaudePath(e), {
      path: 'C:\\Users\\me\\.local\\bin\\claude.exe',
      source: 'default',
    });
  });

  test('どこにも無ければ not-found', () => {
    assert.deepStrictEqual(resolveClaudePath(env({ existing: [] })), { error: 'not-found' });
  });
});
