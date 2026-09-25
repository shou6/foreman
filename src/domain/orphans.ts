/**
 * 異常終了で残ったプロセスの見分け方（NFR-5、Windows だけ）。
 * 拡張機能ホストが突然終わると、claude.exe は入力の管が切れて自分で終わるが、
 * Claude が実行していたコマンド（bash、node など）は残る。次の起動で、記録と今のプロセスの一覧を突き合わせて止める。
 * 誤って別のプロセスを止めないよう、番号だけでなく起動時刻と名前でも確かめる
 */

/** 今動いているプロセス */
export interface ProcessInfo {
  pid: number;
  /** 親のプロセスの番号 */
  ppid: number;
  name: string;
  /** 起動した時刻（エポックミリ秒） */
  createdAt: number;
}

/** Foreman が起動した claude のプロセス */
export interface TrackedRun {
  pid: number;
  startedAt: number;
}

/** 拡張機能ホスト（VS Code のウィンドウごと）の記録 */
export interface HostRecord {
  hostPid: number;
  hostStartedAt: number;
  runs: TrackedRun[];
}

/** 起動時刻の比べ方の幅。記録した時刻と、OS が持つ起動時刻の差を許す */
const TOLERANCE_MS = 5000;

function sameProcess(info: ProcessInfo | undefined, startedAt: number): info is ProcessInfo {
  return info !== undefined && Math.abs(info.createdAt - startedAt) <= TOLERANCE_MS;
}

/** 記録したホストが今も動いているか（番号が使い回されていれば、動いていない） */
export function hostIsRunning(record: HostRecord, processes: readonly ProcessInfo[]): boolean {
  return sameProcess(
    processes.find((p) => p.pid === record.hostPid),
    record.hostStartedAt
  );
}

/**
 * 止めるプロセスの番号（それぞれ子ごと止める）。ホストが動いていれば何も止めない。
 * - claude.exe が残っていれば、それ（名前と起動時刻が合う時だけ）
 * - 終わっていれば、それを親に持ち、それより後に起動したプロセス
 * - 番号が別のプロセスに使い回されていれば、そのプロセスもその子も止めない
 */
export function orphanTargets(record: HostRecord, processes: readonly ProcessInfo[]): number[] {
  if (hostIsRunning(record, processes)) {
    return [];
  }
  const targets: number[] = [];
  for (const run of record.runs) {
    const info = processes.find((p) => p.pid === run.pid);
    if (info !== undefined) {
      if (sameProcess(info, run.startedAt) && /^claude(\.exe)?$/i.test(info.name)) {
        targets.push(run.pid);
      }
      continue;
    }
    for (const child of processes) {
      if (child.ppid === run.pid && child.createdAt >= run.startedAt - TOLERANCE_MS) {
        targets.push(child.pid);
      }
    }
  }
  return targets;
}
