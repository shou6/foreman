import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FsRunRecordStore, parseProcessList } from '../../../adapters/windowsProcesses';

suite('windowsProcesses: プロセスの一覧の読み取りと、記録の保存', () => {
  test('PowerShell の JSON（1 件の時はオブジェクト）を、番号・親・名前・起動時刻にする', () => {
    assert.deepStrictEqual(
      parseProcessList(
        '[{"ProcessId":4,"ParentProcessId":0,"Name":"System","Created":null},' +
          '{"ProcessId":200,"ParentProcessId":100,"Name":"claude.exe","Created":1790000060000}]'
      ),
      [{ pid: 200, ppid: 100, name: 'claude.exe', createdAt: 1790000060000 }]
    );
    assert.deepStrictEqual(
      parseProcessList('{"ProcessId":7,"ParentProcessId":1,"Name":"a.exe","Created":5}'),
      [{ pid: 7, ppid: 1, name: 'a.exe', createdAt: 5 }]
    );
    assert.deepStrictEqual(parseProcessList(''), []);
  });

  test('記録はホストごとのファイルに保存し、一覧・上書き・削除ができる。壊れたファイルは読み飛ばす', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-runs-'));
    const store = new FsRunRecordStore(dir);
    const a = { hostPid: 1, hostStartedAt: 10, runs: [{ pid: 2, startedAt: 11 }] };
    const b = { hostPid: 3, hostStartedAt: 30, runs: [] };
    await store.save(a);
    await store.save(b);
    await store.save({ ...a, runs: [{ pid: 5, startedAt: 12 }] });
    fs.writeFileSync(path.join(dir, 'broken.json'), '{');
    const hosts = (await store.hosts()).sort((x, y) => x.hostPid - y.hostPid);
    assert.deepStrictEqual(hosts, [{ ...a, runs: [{ pid: 5, startedAt: 12 }] }, b]);
    await store.remove(a);
    assert.deepStrictEqual(await store.hosts(), [b]);
  });
});
