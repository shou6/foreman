import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { HostRecord, ProcessInfo } from '../domain/orphans';
import type { ProcessTable, RunRecordStore } from '../ports/processes';

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve(stdout)
    );
  });
}

/** PowerShell が出す JSON（1 件ならオブジェクト）を読む。起動時刻の無いもの（System など）は除く */
export function parseProcessList(json: string): ProcessInfo[] {
  if (json.trim() === '') {
    return [];
  }
  const parsed: unknown = JSON.parse(json);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.flatMap((row) => {
    const r = row as Record<string, unknown>;
    return typeof r.ProcessId === 'number' &&
      typeof r.ParentProcessId === 'number' &&
      typeof r.Name === 'string' &&
      typeof r.Created === 'number'
      ? [{ pid: r.ProcessId, ppid: r.ParentProcessId, name: r.Name, createdAt: r.Created }]
      : [];
  });
}

/** Windows のプロセスの一覧（CIM）と停止（taskkill） */
export class WindowsProcessTable implements ProcessTable {
  async list(): Promise<ProcessInfo[]> {
    const script =
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,' +
      "@{n='Created';e={if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { $null }}}" +
      ' | ConvertTo-Json -Compress';
    return parseProcessList(
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    );
  }

  async killTree(pid: number): Promise<void> {
    await run('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
  }
}

/** ホストごとの記録を、保存領域の 1 ファイルずつに置く（ウィンドウ同士で書き込みがぶつからない） */
export class FsRunRecordStore implements RunRecordStore {
  constructor(private readonly dir: string) {}

  private file(record: HostRecord): string {
    return path.join(this.dir, `${record.hostPid}-${record.hostStartedAt}.json`);
  }

  async hosts(): Promise<HostRecord[]> {
    let names: string[];
    try {
      names = await fs.promises.readdir(this.dir);
    } catch {
      return [];
    }
    const records: HostRecord[] = [];
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      try {
        const data = JSON.parse(
          await fs.promises.readFile(path.join(this.dir, name), 'utf8')
        ) as HostRecord;
        if (typeof data.hostPid === 'number' && Array.isArray(data.runs)) {
          records.push(data);
        }
      } catch {
        // 書きかけや壊れたファイルは読み飛ばす
      }
    }
    return records;
  }

  async save(record: HostRecord): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    await fs.promises.writeFile(this.file(record), JSON.stringify(record));
  }

  async remove(record: HostRecord): Promise<void> {
    await fs.promises.rm(this.file(record), { force: true });
  }
}
