import * as assert from 'assert';
import { ApprovalService, type PendingRequest } from '../../../app/approvalService';
import type { PermissionRequest } from '../../../domain/events';

const REQUEST: PermissionRequest = {
  toolName: 'Edit',
  input: { file_path: 'a.txt' },
  suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
};

suite('ApprovalService', () => {
  test('要求を保留し、返事で解決する', async () => {
    let n = 0;
    const service = new ApprovalService(() => `req-${++n}`);
    const decision = service.request('task-1', REQUEST);
    const pending = service.pending('task-1');
    assert.deepStrictEqual(pending, { id: 'req-1', ...REQUEST });
    service.decide('task-1', 'req-1', { behavior: 'allow' });
    assert.deepStrictEqual(await decision, { behavior: 'allow' });
    assert.strictEqual(service.pending('task-1'), undefined);
  });

  test('保留の変化を伝える', async () => {
    const service = new ApprovalService(() => 'req-1');
    const changes: { taskId: string; pending: PendingRequest | undefined }[] = [];
    service.onDidChange((taskId, pending) => changes.push({ taskId, pending }));
    const decision = service.request('task-1', REQUEST);
    service.decide('task-1', 'req-1', { behavior: 'deny', message: 'no' });
    await decision;
    assert.deepStrictEqual(changes, [
      { taskId: 'task-1', pending: { id: 'req-1', ...REQUEST } },
      { taskId: 'task-1', pending: undefined },
    ]);
  });

  test('id が合わない返事は無視する', () => {
    const service = new ApprovalService(() => 'req-1');
    void service.request('task-1', REQUEST);
    service.decide('task-1', 'other', { behavior: 'allow' });
    assert.notStrictEqual(service.pending('task-1'), undefined);
  });

  test('cancel は保留中の要求を拒否として解決する', async () => {
    const service = new ApprovalService(() => 'req-1');
    const decision = service.request('task-1', REQUEST);
    service.cancel('task-1');
    const result = await decision;
    assert.strictEqual(result.behavior, 'deny');
    assert.strictEqual(service.pending('task-1'), undefined);
  });

  test('タスクごとに独立している', () => {
    let n = 0;
    const service = new ApprovalService(() => `req-${++n}`);
    void service.request('task-1', REQUEST);
    void service.request('task-2', REQUEST);
    assert.strictEqual(service.pending('task-1')?.id, 'req-1');
    assert.strictEqual(service.pending('task-2')?.id, 'req-2');
  });
});
