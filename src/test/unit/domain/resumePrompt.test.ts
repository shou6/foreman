import * as assert from 'assert';
import { resumePrompt } from '../../../domain/resumePrompt';
import type { Task } from '../../../domain/task';

function task(status: Task['status'], lastResult: Task['turns'][number]['result']): Task {
  return {
    id: 't',
    title: 't',
    status,
    cwd: 'D:\\work',
    permissionMode: 'default',
    alwaysAllowed: [],
    turns: [
      { index: 0, prompt: 'first', attachments: [], startedAt: 'a', endedAt: 'a', changes: [] },
      {
        index: 1,
        prompt: 'add a test',
        attachments: [],
        startedAt: 'b',
        endedAt: 'b',
        result: lastResult,
        changes: [],
      },
    ],
    createdAt: 'a',
    updatedAt: 'b',
  };
}

suite('resumePrompt', () => {
  test('中断したタスクの再開では、中断した指示を添える', () => {
    const t = task('interrupted', { ok: false, reason: 'VS Code was closed' });
    assert.strictEqual(
      resumePrompt(t, 'continue'),
      'The previous instruction was interrupted before it finished: "add a test". Continue from there if it still applies.\n\ncontinue'
    );
  });

  test('完了や失敗からの追加の指示はそのまま', () => {
    assert.strictEqual(resumePrompt(task('done', { ok: true }), 'next'), 'next');
    assert.strictEqual(resumePrompt(task('failed', { ok: false, reason: 'x' }), 'next'), 'next');
  });

  test('ターンが無ければそのまま', () => {
    const t = { ...task('interrupted', undefined), turns: [] };
    assert.strictEqual(resumePrompt(t, 'p'), 'p');
  });
});
