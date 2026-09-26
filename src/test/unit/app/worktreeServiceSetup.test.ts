import * as assert from 'assert';
import { WorktreeService } from '../../../app/worktreeService';
import { FakeGit } from '../../support/fakes/fakeGit';

const REPO = 'D:\\work\\repo';
const WT = 'D:\\work\\repo\\.foreman\\worktrees\\t-0f3a9c';

interface Options {
  patterns?: string[];
  command?: string;
  found?: string[];
  existing?: string[];
  copyError?: string;
  runError?: Error;
}

function build(o: Options = {}): {
  git: FakeGit;
  service: WorktreeService;
  log: string[];
  errors: unknown[];
} {
  const git = new FakeGit(REPO, 'main');
  const log: string[] = [];
  const errors: unknown[] = [];
  const service = new WorktreeService({
    git,
    sep: '\\',
    setup: {
      copyPatterns: () => o.patterns ?? [],
      command: () => o.command ?? '',
      findFiles: async (root, patterns) => {
        log.push(`find ${root} ${patterns.join(',')}`);
        return o.found ?? [];
      },
      exists: async (path) => (o.existing ?? []).includes(path),
      copyFile: async (from, to) => {
        if (from.endsWith(o.copyError ?? '\0')) {
          throw new Error('copy failed');
        }
        log.push(`copy ${from} -> ${to}`);
      },
      run: async (cwd, command) => {
        log.push(`run ${cwd} ${command}`);
        if (o.runError !== undefined) {
          throw o.runError;
        }
      },
      onError: (error) => errors.push(error),
    },
  });
  return { git, service, log, errors };
}

suite('WorktreeService: 作った直後の準備', () => {
  test('glob に合う本体のファイルを worktree の同じ場所へコピーし、その後に準備のコマンドを worktree で実行する', async () => {
    const { git, service, log } = build({
      patterns: ['.env*', 'config/*.local.json'],
      command: 'npm install',
      found: ['.env', 'config\\app.local.json'],
    });
    const wt = await service.create(REPO, 'T', '0f3a9c12');
    assert.strictEqual(wt.path, WT);
    assert.ok(git.calls.some((c) => c.startsWith('addWorktree ')));
    assert.deepStrictEqual(log, [
      `find ${REPO} .env*,config/*.local.json`,
      `copy ${REPO}\\.env -> ${WT}\\.env`,
      `copy ${REPO}\\config\\app.local.json -> ${WT}\\config\\app.local.json`,
      `run ${WT} npm install`,
    ]);
  });

  test('worktree に既にあるファイル（Git が管理するもの）は上書きしない', async () => {
    const { service, log } = build({
      patterns: ['.env*'],
      found: ['.env', '.env.example'],
      existing: [`${WT}\\.env.example`],
    });
    await service.create(REPO, 'T', '0f3a9c12');
    assert.deepStrictEqual(log, [`find ${REPO} .env*`, `copy ${REPO}\\.env -> ${WT}\\.env`]);
  });

  test('設定が空なら、ファイルを探さず、コマンドも走らせない', async () => {
    const { service, log } = build({ patterns: [], command: '  ' });
    await service.create(REPO, 'T', '0f3a9c12');
    assert.deepStrictEqual(log, []);
  });

  test('準備のコマンドが失敗しても worktree を返し、失敗を知らせる', async () => {
    const { service, errors } = build({ command: 'npm install', runError: new Error('exit 1') });
    const wt = await service.create(REPO, 'T', '0f3a9c12');
    assert.strictEqual(wt.path, WT);
    assert.strictEqual(errors.length, 1);
    assert.match(String(errors[0]), /exit 1/);
  });

  test('コピーに失敗したファイルは知らせて飛ばし、残りのコピーと準備のコマンドは続ける', async () => {
    const { service, log, errors } = build({
      patterns: ['*'],
      command: 'npm install',
      found: ['.env', 'secret.json'],
      copyError: '.env',
    });
    await service.create(REPO, 'T', '0f3a9c12');
    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(log.slice(1), [
      `copy ${REPO}\\secret.json -> ${WT}\\secret.json`,
      `run ${WT} npm install`,
    ]);
  });

  test('切り出し（元のブランチを指定）でも、コピー元はリポジトリの本体', async () => {
    const { git, service, log } = build({ patterns: ['.env'], found: ['.env'] });
    git.repos.get(REPO)!.branches.add('foreman/parent');
    await service.create(REPO, 'T', '0f3a9c12', 'foreman/parent');
    assert.deepStrictEqual(log, [`find ${REPO} .env`, `copy ${REPO}\\.env -> ${WT}\\.env`]);
  });
});
