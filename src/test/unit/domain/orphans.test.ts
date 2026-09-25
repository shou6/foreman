import * as assert from 'assert';
import {
  hostIsRunning,
  orphanTargets,
  type HostRecord,
  type ProcessInfo,
} from '../../../domain/orphans';

const T = 1_790_000_000_000;
const HOST: HostRecord = {
  hostPid: 100,
  hostStartedAt: T,
  runs: [{ pid: 200, startedAt: T + 60_000 }],
};

const proc = (pid: number, ppid: number, name: string, createdAt: number): ProcessInfo => ({
  pid,
  ppid,
  name,
  createdAt,
});

suite('orphans: 異常終了で残ったプロセスを見分ける', () => {
  test('記録した拡張機能ホストがまだ動いていれば（別のウィンドウなど）、何も止めない', () => {
    const processes = [proc(100, 1, 'Code.exe', T + 500), proc(200, 100, 'claude.exe', T + 60_200)];
    assert.strictEqual(hostIsRunning(HOST, processes), true);
    assert.deepStrictEqual(orphanTargets(HOST, processes), []);
  });

  test('ホストの番号が別のプロセスに使い回されていれば、ホストは終わっている', () => {
    const processes = [proc(100, 1, 'Code.exe', T + 3_600_000)];
    assert.strictEqual(hostIsRunning(HOST, processes), false);
  });

  test('ホストが終わり、claude.exe が残っていれば、それを（子ごと）止める', () => {
    const processes = [
      proc(200, 100, 'claude.exe', T + 60_300),
      proc(300, 200, 'bash.exe', T + 70_000),
    ];
    assert.deepStrictEqual(orphanTargets(HOST, processes), [200]);
  });

  test('claude.exe が終わっていれば、それを親に持っていた、後から起動したプロセスを止める', () => {
    const processes = [
      proc(300, 200, 'bash.exe', T + 70_000),
      proc(301, 200, 'node.exe', T + 80_000),
      proc(400, 999, 'bash.exe', T + 70_000),
    ];
    assert.deepStrictEqual(orphanTargets(HOST, processes), [300, 301]);
  });

  test('親の番号が同じでも、claude.exe より前に起動したプロセスは止めない', () => {
    const processes = [proc(300, 200, 'explorer.exe', T - 100_000)];
    assert.deepStrictEqual(orphanTargets(HOST, processes), []);
  });

  test('claude.exe の番号が別のプロセスに使い回されていれば、そのプロセスもその子も止めない', () => {
    const renamed = [
      proc(200, 5, 'chrome.exe', T + 60_100),
      proc(300, 200, 'chrome.exe', T + 90_000),
    ];
    assert.deepStrictEqual(orphanTargets(HOST, renamed), []);
    const later = [
      proc(200, 5, 'claude.exe', T + 3_600_000),
      proc(300, 200, 'bash.exe', T + 3_700_000),
    ];
    assert.deepStrictEqual(orphanTargets(HOST, later), []);
  });
});
