import * as assert from 'assert';
import {
  canMerge,
  canUnapprove,
  createTask,
  transition,
  TaskStateError,
  type TaskEvent,
  type TaskStatus,
} from '../../../domain/task';

suite('transition', () => {
  const allowed: [TaskStatus, TaskEvent, TaskStatus][] = [
    ['running', 'permission-requested', 'waiting'],
    ['running', 'question-asked', 'waiting'],
    ['waiting', 'answered', 'running'],
    ['running', 'turn-completed', 'waiting'],
    ['running', 'error', 'failed'],
    ['waiting', 'error', 'failed'],
    ['running', 'stop', 'interrupted'],
    ['waiting', 'stop', 'interrupted'],
    ['running', 'host-exit', 'interrupted'],
    ['waiting', 'host-exit', 'interrupted'],
    ['done', 'prompt', 'running'],
    ['failed', 'prompt', 'running'],
    ['interrupted', 'prompt', 'running'],
    ['interrupted', 'resume', 'running'],
  ];

  for (const [from, event, to] of allowed) {
    test(`${from} + ${event} → ${to}`, () => {
      assert.strictEqual(transition(from, event), to);
    });
  }

  const rejected: [TaskStatus, TaskEvent][] = [
    ['done', 'answered'],
    ['done', 'turn-completed'],
    ['done', 'stop'],
    ['failed', 'answered'],
    ['interrupted', 'answered'],
    ['running', 'answered'],
    ['running', 'prompt'],
    ['running', 'resume'],
    ['waiting', 'turn-completed'],
    ['waiting', 'permission-requested'],
    ['done', 'resume'],
  ];

  for (const [from, event] of rejected) {
    test(`${from} + ${event} は許されない`, () => {
      assert.throws(() => transition(from, event), TaskStateError);
    });
  }

  test('許されない遷移のエラーには、状態とイベントが入る', () => {
    assert.throws(
      () => transition('done', 'answered'),
      (e: unknown) => e instanceof TaskStateError && e.status === 'done' && e.event === 'answered'
    );
  });
});

suite('createTask', () => {
  const base = {
    id: 'task-1',
    prompt: 'README に使い方の節を足して',
    cwd: 'D:\\work\\sample',
    createdAt: '2026-09-23T10:00:00.000Z',
  };

  test('作成直後は実行中で、ターンと常に許可の一覧は空', () => {
    const task = createTask(base);
    assert.strictEqual(task.id, 'task-1');
    assert.strictEqual(task.status, 'running');
    assert.strictEqual(task.cwd, base.cwd);
    assert.deepStrictEqual(task.turns, []);
    assert.deepStrictEqual(task.alwaysAllowed, []);
    assert.strictEqual(task.sessionId, undefined);
    assert.strictEqual(task.parentTaskId, undefined);
    assert.strictEqual(task.createdAt, base.createdAt);
    assert.strictEqual(task.updatedAt, base.createdAt);
  });

  test('タイトルを省略すると、指示の先頭から作る', () => {
    assert.strictEqual(createTask(base).title, 'README に使い方の節を足して');
  });

  test('タイトルを渡すと、そのまま使う', () => {
    assert.strictEqual(createTask({ ...base, title: '使い方' }).title, '使い方');
  });

  test('空の指示ではタスクを作れない', () => {
    assert.throws(() => createTask({ ...base, prompt: '   ' }), /prompt/);
  });

  test('承認方式の既定は毎回確認', () => {
    assert.strictEqual(createTask(base).permissionMode, 'default');
    assert.strictEqual(
      createTask({ ...base, permissionMode: 'acceptEdits' }).permissionMode,
      'acceptEdits'
    );
  });

  test('モデルは省略できる', () => {
    assert.strictEqual(createTask(base).model, undefined);
    assert.strictEqual(createTask({ ...base, model: 'claude-sonnet-5' }).model, 'claude-sonnet-5');
  });

  test('切り出し元のタスクを持てる', () => {
    assert.strictEqual(createTask({ ...base, parentTaskId: 'task-0' }).parentTaskId, 'task-0');
  });
});

suite('transition: 下書きとレビュー待ち（M10）', () => {
  const allowed: [TaskStatus, TaskEvent, TaskStatus][] = [
    ['draft', 'start', 'running'],
    ['waiting', 'changes-recorded', 'review'],
    ['waiting', 'prompt', 'running'],
    ['waiting', 'approve', 'done'],
    ['done', 'changes-recorded', 'review'],
    ['review', 'approve', 'done'],
    ['review', 'prompt', 'running'],
  ];
  for (const [from, event, to] of allowed) {
    test(`${from} + ${event} → ${to}`, () => {
      assert.strictEqual(transition(from, event), to);
    });
  }

  test('下書きには指示を送れず、実行中は承認できない', () => {
    assert.throws(() => transition('draft', 'prompt'), TaskStateError);
    assert.throws(() => transition('running', 'approve'), TaskStateError);
    assert.throws(() => transition('running', 'start'), TaskStateError);
  });

  test('createTask に draft を渡すと下書きになり、指示は draftPrompt に入る', () => {
    const task = createTask({
      id: 't',
      prompt: 'later',
      cwd: 'D:\\w',
      createdAt: '2026-09-24T00:00:00.000Z',
      draft: true,
    });
    assert.strictEqual(task.status, 'draft');
    assert.strictEqual(task.draftPrompt, 'later');
    assert.strictEqual(task.title, 'later');
  });
});

suite('canMerge: マージできる条件', () => {
  const base = {
    id: 't',
    title: 't',
    cwd: 'D:\\w',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
    createdAt: '',
    updatedAt: '',
    worktree: {
      repo: 'D:\\w',
      path: 'D:\\w\\.foreman\\worktrees\\t',
      branch: 'foreman/t',
      base: 'main',
    },
  };
  const changed = [
    {
      index: 0,
      prompt: 'p',
      attachments: [],
      startedAt: '',
      endedAt: '',
      changes: [
        { path: 'a', kind: 'modified' as const, source: 'edit-tool' as const, reverted: false },
      ],
    },
  ];

  test('worktree があり、承認済み（完了）で、戻していない変更がある時だけ', () => {
    assert.strictEqual(canMerge({ ...base, status: 'done', turns: changed }), true);
    assert.strictEqual(canMerge({ ...base, status: 'review', turns: changed }), false, '未承認');
    assert.strictEqual(canMerge({ ...base, status: 'done', turns: [] }), false, '変更が無い');
    assert.strictEqual(
      canMerge({ ...base, worktree: undefined, status: 'done', turns: changed }),
      false,
      'worktree でない'
    );
    const reverted = changed.map((t) => ({
      ...t,
      changes: t.changes.map((c) => ({ ...c, reverted: true })),
    }));
    assert.strictEqual(canMerge({ ...base, status: 'done', turns: reverted }), false, '全部戻した');
  });
});

suite('canUnapprove', () => {
  const base = createTask({
    id: 't',
    prompt: 'p',
    cwd: 'D:\w',
    createdAt: '2026-09-24T00:00:00.000Z',
  });

  test('承認で完了にしたタスクだけ取り消せる（承認の前の状態を覚えている）', () => {
    assert.strictEqual(canUnapprove({ ...base, status: 'done', approvedFrom: 'review' }), true);
    assert.strictEqual(canUnapprove({ ...base, status: 'done', approvedFrom: 'waiting' }), true);
    assert.strictEqual(canUnapprove({ ...base, status: 'done' }), false);
    assert.strictEqual(canUnapprove({ ...base, status: 'review', approvedFrom: 'review' }), false);
  });
});
