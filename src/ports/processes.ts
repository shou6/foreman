import type { HostRecord, ProcessInfo } from '../domain/orphans';

/** OS のプロセスの一覧と停止。実装は adapters/windowsProcesses.ts（Windows だけ） */
export interface ProcessTable {
  list(): Promise<ProcessInfo[]>;
  /** プロセスを子ごと止める */
  killTree(pid: number): Promise<void>;
}

/** 起動した claude のプロセスの記録。拡張機能ホストごとに持つ */
export interface RunRecordStore {
  hosts(): Promise<HostRecord[]>;
  save(record: HostRecord): Promise<void>;
  remove(record: HostRecord): Promise<void>;
}
