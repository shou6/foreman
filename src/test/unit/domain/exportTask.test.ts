import * as assert from 'assert';
import { exportTaskMarkdown } from '../../../domain/exportTask';
import type { Task } from '../../../domain/task';
import type { TranscriptItem } from '../../../domain/transcript';

const TASK: Task = {
  id: '0f3a9c12-aaaa-bbbb-cccc-ddddeeeeffff',
  title: 'Add a test',
  status: 'done',
  sessionId: 'sess-1',
  cwd: 'D:\\repo\\.foreman\\worktrees\\add-a-test-0f3a9c',
  worktree: {
    repo: 'D:\\repo',
    path: 'D:\\repo\\.foreman\\worktrees\\add-a-test-0f3a9c',
    branch: 'foreman/add-a-test-0f3a9c',
    base: 'main',
  },
  model: 'claude-sonnet-5',
  activeModel: 'claude-sonnet-5-20260901',
  permissionMode: 'default',
  alwaysAllowed: [],
  turns: [
    {
      index: 0,
      prompt: 'Add a test for hello',
      attachments: [{ kind: 'file', path: 'D:\\repo\\src\\hello.ts' }],
      startedAt: '2026-09-24T10:00:00.000Z',
      endedAt: '2026-09-24T10:01:30.000Z',
      result: {
        ok: true,
        usage: {
          inputTokens: 12,
          outputTokens: 340,
          cacheReadInputTokens: 1000,
          cacheCreationInputTokens: 200,
          contextWindow: 200000,
        },
      },
      changes: [
        {
          path: 'src\\test\\unit\\hello.test.ts',
          kind: 'created',
          after: 'h1',
          source: 'edit-tool',
          reverted: false,
          added: 26,
          removed: 0,
        },
      ],
    },
    {
      index: 1,
      prompt: 'Also run it',
      attachments: [],
      startedAt: '2026-09-24T10:02:00.000Z',
      endedAt: '2026-09-24T10:02:20.000Z',
      result: { ok: false, reason: 'API error' },
      changes: [],
    },
  ],
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:02:20.000Z',
};

const ITEMS: TranscriptItem[] = [
  { kind: 'prompt', turn: 0, text: 'Add a test for hello' },
  {
    kind: 'tool',
    turn: 0,
    id: 't1',
    name: 'Read',
    input: { file_path: 'src/hello.ts' },
    status: 'ok',
    output: 'export function hello() {}',
  },
  { kind: 'text', turn: 0, text: 'I will add a test.\n\n## Plan\n- write it' },
  {
    kind: 'tool',
    turn: 0,
    id: 't2',
    name: 'Bash',
    input: { command: 'npm test' },
    status: 'error',
    output: 'boom',
  },
  { kind: 'turn-end', turn: 0, ok: true },
  { kind: 'prompt', turn: 1, text: 'Also run it' },
  { kind: 'turn-end', turn: 1, ok: false, interrupted: false, reason: 'API error' },
];

suite('exportTaskMarkdown', () => {
  const md = exportTaskMarkdown(TASK, ITEMS);

  test('見出しにタイトルと、状態・モデル・worktree・日時のメタ情報を出す', () => {
    assert.ok(md.startsWith('# Add a test\n'));
    assert.ok(md.includes('- Status: done'));
    assert.ok(md.includes('- Model: claude-sonnet-5 (active: claude-sonnet-5-20260901)'));
    assert.ok(md.includes('- Worktree: foreman/add-a-test-0f3a9c (base: main)'));
    assert.ok(md.includes('- Created: 2026-09-24T10:00:00.000Z'));
    assert.ok(md.includes('- Task ID: 0f3a9c12-aaaa-bbbb-cccc-ddddeeeeffff'));
  });

  test('ターンごとに、指示、添付、出力、ツールの呼び出し、変更、結果を出す', () => {
    assert.ok(md.includes('## Turn 1'));
    assert.ok(md.includes('> Add a test for hello'));
    assert.ok(md.includes('Attachments: `D:\\repo\\src\\hello.ts`'));
    assert.ok(md.includes('I will add a test.'));
    assert.ok(md.includes('- ✓ Read `src/hello.ts`'));
    assert.ok(md.includes('- ✗ Bash `npm test`'));
    assert.ok(md.includes('- A `src\\test\\unit\\hello.test.ts` +26 -0'));
    assert.ok(md.includes('Result: ok'));
    assert.ok(md.includes('in=12 cacheRead=1000 cacheWrite=200 out=340'));
    assert.ok(md.includes('## Turn 2'));
    assert.ok(md.includes('Result: failed (API error)'));
  });

  test('ツールの出力は折りたたみに入れ、長ければ切る', () => {
    assert.ok(md.includes('<details>'));
    assert.ok(md.includes('export function hello() {}'));
    const long = exportTaskMarkdown(TASK, [
      {
        kind: 'tool',
        turn: 0,
        id: 't',
        name: 'Bash',
        input: {},
        status: 'ok',
        output: 'x'.repeat(5000),
      },
    ]);
    assert.ok(long.includes('x'.repeat(2000)));
    assert.ok(!long.includes('x'.repeat(2001)));
    assert.ok(long.includes('(truncated)'));
  });

  test('Claude の出力に見出しがあっても、文書の構造を壊さないよう 1 段下げる', () => {
    assert.ok(md.includes('#### Plan'));
    assert.ok(!md.includes('\n## Plan'));
  });
});
