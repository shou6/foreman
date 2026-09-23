import * as assert from 'assert';
import { lint } from 'markdownlint/sync';
import { exportTaskMarkdown } from '../../../domain/exportTask';
import type { Task } from '../../../domain/task';
import type { TranscriptItem } from '../../../domain/transcript';

const TASK: Task = {
  id: 'id-1',
  title: 'Lint me',
  status: 'done',
  cwd: 'D:\\repo',
  permissionMode: 'default',
  alwaysAllowed: [],
  turns: [
    {
      index: 0,
      prompt: 'first\nsecond line',
      attachments: ['D:\\repo\\a.ts'],
      startedAt: 't',
      endedAt: 't',
      result: { ok: true },
      changes: [
        {
          path: 'a.ts',
          kind: 'modified',
          before: 'h',
          after: 'h2',
          source: 'edit-tool',
          reverted: false,
          added: 1,
          removed: 1,
        },
      ],
    },
    { index: 1, prompt: 'p2', attachments: [], startedAt: 't', changes: [] },
  ],
  createdAt: 't',
  updatedAt: 't',
};

const ITEMS: TranscriptItem[] = [
  { kind: 'prompt', turn: 0, text: 'first' },
  {
    kind: 'tool',
    turn: 0,
    id: '1',
    name: 'Read',
    input: { file_path: 'a.ts' },
    status: 'ok',
    output: 'line1\nline2\n',
  },
  { kind: 'text', turn: 0, text: '# Heading\nSome text\n- item\n```ts\ncode\n```' },
  {
    kind: 'tool',
    turn: 0,
    id: '2',
    name: 'Bash',
    input: { command: 'ls' },
    status: 'error',
    output: '',
  },
  { kind: 'text', turn: 0, text: 'done  \n' },
  { kind: 'turn-end', turn: 0, ok: true },
  { kind: 'prompt', turn: 1, text: 'p2' },
];

suite('exportTaskMarkdown: markdownlint', () => {
  test('既定のルール（行長と、折りたたみの HTML を除く）に通る', () => {
    const md = exportTaskMarkdown(TASK, ITEMS);
    const result = lint({
      strings: { 'export.md': md },
      config: {
        default: true,
        MD013: false,
        MD033: { allowed_elements: ['details', 'summary'] },
      },
    });
    const errors = result['export.md'] ?? [];
    assert.deepStrictEqual(
      errors.map((e) => `${e.lineNumber}: ${e.ruleNames[0]} ${e.ruleDescription}`),
      []
    );
  });
});
