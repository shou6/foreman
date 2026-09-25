import { hostIsRunning, orphanTargets, type HostRecord } from '../domain/orphans';
import type { ProcessTable, RunRecordStore } from '../ports/processes';

export interface OrphanCleanerDeps {
  table: ProcessTable;
  records: RunRecordStore;
  /** 今の拡張機能ホスト */
  host: { pid: number; startedAt: number };
  log?: (line: string) => void;
}

/**
 * 異常終了で残ったプロセスの後始末（NFR-5、Windows だけ）。
 * 起動した claude のプロセスを記録しておき、次の起動で、終わったホストの記録から残ったプロセスを止める
 */
export class OrphanCleaner {
  private readonly record: HostRecord;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly deps: OrphanCleanerDeps) {
    this.record = { hostPid: deps.host.pid, hostStartedAt: deps.host.startedAt, runs: [] };
  }

  /** 終わったホストの記録から残ったプロセスを止め、その記録を消す。止めたプロセスの番号を返す */
  async cleanup(): Promise<number[]> {
    const others = (await this.deps.records.hosts()).filter(
      (r) => r.hostPid !== this.record.hostPid
    );
    if (others.length === 0) {
      return [];
    }
    const processes = await this.deps.table.list();
    const stopped: number[] = [];
    for (const record of others) {
      if (hostIsRunning(record, processes)) {
        continue;
      }
      for (const pid of orphanTargets(record, processes)) {
        try {
          await this.deps.table.killTree(pid);
          stopped.push(pid);
        } catch (error) {
          this.deps.log?.(`failed to stop process ${pid}: ${String(error)}`);
        }
      }
      await this.deps.records.remove(record);
    }
    return stopped;
  }

  /** claude のプロセスを起動した */
  spawned(pid: number, startedAt: number): void {
    this.record.runs.push({ pid, startedAt });
    this.persist();
  }

  /** claude のプロセスが終わった */
  exited(pid: number): void {
    this.record.runs = this.record.runs.filter((run) => run.pid !== pid);
    this.persist();
  }

  private persist(): void {
    const snapshot: HostRecord = { ...this.record, runs: [...this.record.runs] };
    this.saving = this.saving
      .then(() =>
        snapshot.runs.length === 0
          ? this.deps.records.remove(snapshot)
          : this.deps.records.save(snapshot)
      )
      .catch((error: unknown) =>
        this.deps.log?.(`failed to save process records: ${String(error)}`)
      );
  }
}
