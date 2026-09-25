import * as assert from 'assert';
import { OrphanCleaner } from '../../../app/orphanCleaner';
import type { HostRecord, ProcessInfo } from '../../../domain/orphans';
import type { ProcessTable, RunRecordStore } from '../../../ports/processes';

const T = 1_790_000_000_000;

class FakeTable implements ProcessTable {
  killed: number[] = [];
  constructor(public processes: ProcessInfo[]) {}
  async list(): Promise<ProcessInfo[]> {
    return this.processes;
  }
  async killTree(pid: number): Promise<void> {
    this.killed.push(pid);
  }
}

class FakeRecords implements RunRecordStore {
  constructor(public records: HostRecord[]) {}
  async hosts(): Promise<HostRecord[]> {
    return this.records.map((r) => ({ ...r, runs: [...r.runs] }));
  }
  async save(record: HostRecord): Promise<void> {
    this.records = [
      ...this.records.filter((r) => r.hostPid !== record.hostPid),
      { ...record, runs: [...record.runs] },
    ];
  }
  async remove(record: HostRecord): Promise<void> {
    this.records = this.records.filter((r) => r.hostPid !== record.hostPid);
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

suite('OrphanCleaner: 起動時の後始末と、起動したプロセスの記録', () => {
  test('終わったホストの記録から、残ったプロセスを止めて記録を消す。動いているホストと自分の記録は触らない', async () => {
    const dead: HostRecord = {
      hostPid: 10,
      hostStartedAt: T,
      runs: [{ pid: 20, startedAt: T + 1000 }],
    };
    const alive: HostRecord = {
      hostPid: 11,
      hostStartedAt: T,
      runs: [{ pid: 21, startedAt: T + 1000 }],
    };
    const self: HostRecord = {
      hostPid: 12,
      hostStartedAt: T,
      runs: [{ pid: 22, startedAt: T + 1000 }],
    };
    const table = new FakeTable([
      { pid: 11, ppid: 1, name: 'Code.exe', createdAt: T },
      { pid: 30, ppid: 20, name: 'node.exe', createdAt: T + 5000 },
      { pid: 31, ppid: 21, name: 'node.exe', createdAt: T + 5000 },
      { pid: 32, ppid: 22, name: 'node.exe', createdAt: T + 5000 },
    ]);
    const records = new FakeRecords([dead, alive, self]);
    const cleaner = new OrphanCleaner({ table, records, host: { pid: 12, startedAt: T } });
    const stopped = await cleaner.cleanup();
    assert.deepStrictEqual(stopped, [30]);
    assert.deepStrictEqual(table.killed, [30]);
    assert.deepStrictEqual(records.records.map((r) => r.hostPid).sort(), [11, 12]);
  });

  test('記録が無ければ、プロセスの一覧を取らない（起動を遅くしない）', async () => {
    let listed = false;
    const table = new FakeTable([]);
    table.list = async () => {
      listed = true;
      return [];
    };
    const cleaner = new OrphanCleaner({
      table,
      records: new FakeRecords([]),
      host: { pid: 12, startedAt: T },
    });
    assert.deepStrictEqual(await cleaner.cleanup(), []);
    assert.strictEqual(listed, false);
  });

  test('起動したプロセスを記録し、終わったら外す。無くなれば記録ごと消す', async () => {
    const records = new FakeRecords([]);
    const cleaner = new OrphanCleaner({
      table: new FakeTable([]),
      records,
      host: { pid: 12, startedAt: T },
    });
    cleaner.spawned(40, T + 100);
    cleaner.spawned(41, T + 200);
    await settle();
    assert.deepStrictEqual(records.records, [
      {
        hostPid: 12,
        hostStartedAt: T,
        runs: [
          { pid: 40, startedAt: T + 100 },
          { pid: 41, startedAt: T + 200 },
        ],
      },
    ]);
    cleaner.exited(40);
    await settle();
    assert.deepStrictEqual(records.records[0]?.runs, [{ pid: 41, startedAt: T + 200 }]);
    cleaner.exited(41);
    await settle();
    assert.deepStrictEqual(records.records, []);
  });
});

suite('OrphanCleaner: ホストのプロセスの番号の使い回し', () => {
  test('落ちたホストと今のホストの番号が同じでも、起動時刻が違えば別のホストとして後始末する', async () => {
    const crashed: HostRecord = {
      hostPid: 12,
      hostStartedAt: T - 3_600_000,
      runs: [{ pid: 20, startedAt: T - 3_500_000 }],
    };
    const table = new FakeTable([
      { pid: 12, ppid: 1, name: 'Code.exe', createdAt: T },
      { pid: 30, ppid: 20, name: 'node.exe', createdAt: T - 3_400_000 },
    ]);
    const records = new FakeRecords([crashed]);
    const cleaner = new OrphanCleaner({ table, records, host: { pid: 12, startedAt: T } });
    assert.deepStrictEqual(await cleaner.cleanup(), [30]);
    assert.deepStrictEqual(records.records, []);
  });
});
