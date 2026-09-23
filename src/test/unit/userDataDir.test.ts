import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  socketPathFits,
  SOCKET_PATH_LIMIT,
  testLaunchArgs,
  testUserDataDir,
} from '../support/userDataDir';

/**
 * macOS では Unix ドメインソケットのパスが 103 文字を超えると VS Code が起動できない。
 * GitHub Actions の macOS で実際に起きた（106 文字で EINVAL）。
 */
suite('testUserDataDir', () => {
  test('GitHub Actions の macOS の一時ディレクトリでも、ソケットのパスが上限に収まる', () => {
    // 実際のランナーの値。例: /var/folders/xx/abcd1234efgh5678ijkl/T/
    const runnerTmp = '/var/folders/qx/5nr4vjws3qs6b2j5djxsmg0h0000gn/T';
    const dir = testUserDataDir(runnerTmp);
    assert.ok(socketPathFits(dir), dir + ' → ' + (dir.length + 20) + ' 文字');
  });

  test('失敗した時と同じ長さの作業ディレクトリでも、影響を受けない', () => {
    // リポジトリ直下に置くと 106 文字になっていた場所
    const repo = '/Users/runner/work/ai-extension-recommender/ai-extension-recommender';
    assert.ok(!socketPathFits(path.join(repo, '.vscode-test', 'user-data')), '前提の確認');
    assert.ok(socketPathFits(testUserDataDir('/var/folders/ab/cdefghijklmnop/T')));
  });

  test('Windows の一時ディレクトリでも短いままにする', () => {
    const dir = testUserDataDir('C:\\Users\\runneradmin\\AppData\\Local\\Temp');
    assert.ok(socketPathFits(dir), dir);
  });

  test('上限は macOS の sun_path に合わせて 103', () => {
    assert.strictEqual(SOCKET_PATH_LIMIT, 103);
  });

  test('socketPathFits は上限ちょうどを許し、超えたら false', () => {
    const base = '/tmp/' + 'a'.repeat(200);
    assert.ok(!socketPathFits(base));
    assert.ok(socketPathFits('/tmp/x'));
  });
});

suite('testLaunchArgs', () => {
  test('--user-data-dir として渡す（userDataDir という設定項目は test-cli に無く、黙って無視される）', () => {
    const args = testLaunchArgs('/tmp');
    const index = args.indexOf('--user-data-dir');
    assert.ok(index !== -1, args.join(' '));
    assert.strictEqual(args[index + 1], testUserDataDir('/tmp'));
  });
});

suite('.vscode-test.mjs', () => {
  test('launchArgs で user-data-dir を渡している', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../../../.vscode-test.mjs'), 'utf8');
    assert.ok(config.includes('launchArgs'), config);
    assert.ok(config.includes('testLaunchArgs'), config);
  });
});
