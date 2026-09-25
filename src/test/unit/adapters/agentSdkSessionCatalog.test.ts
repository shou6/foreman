import * as assert from 'assert';
import {
  AgentSdkSessionCatalog,
  historyFromMessages,
  type SessionFns,
} from '../../../adapters/agentSdkSessionCatalog';

type Message = Parameters<typeof historyFromMessages>[0][number];

/** SDK の SessionMessage の最小限の形 */
function m(
  type: 'user' | 'assistant' | 'system',
  uuid: string,
  content: unknown,
  extra: Record<string, unknown> = {}
): Message {
  return {
    type,
    uuid,
    session_id: 's1',
    message: { role: type, content },
    parent_tool_use_id: null,
    parent_agent_id: null,
    ...extra,
  } as unknown as Message;
}

const human = { origin: { kind: 'human' } };

suite('AgentSdkSessionCatalog', () => {
  test('作業フォルダのセッションを新しい順に並べ、題名は自分で付けた名前を優先する', async () => {
    const calls: unknown[] = [];
    const fns: SessionFns = {
      listSessions: async (options) => {
        calls.push(options);
        return [
          { sessionId: 'a', summary: 'Old one', lastModified: 100, firstPrompt: 'old' },
          {
            sessionId: 'b',
            summary: 'Auto summary',
            customTitle: 'My title',
            lastModified: 200,
            cwd: 'D:\\w',
            gitBranch: 'main',
          },
        ] as never;
      },
      getSessionMessages: async () => [],
    };
    const catalog = new AgentSdkSessionCatalog(fns);
    assert.deepStrictEqual(await catalog.list('D:\\w'), [
      {
        sessionId: 'b',
        title: 'My title',
        lastModified: 200,
        cwd: 'D:\\w',
        gitBranch: 'main',
      },
      { sessionId: 'a', title: 'Old one', lastModified: 100, firstPrompt: 'old' },
    ]);
    assert.deepStrictEqual(calls, [{ dir: 'D:\\w' }]);
  });

  test('履歴は、人の指示ごとにターンに分け、出力とツールの呼び出しをイベントにする', () => {
    const turns = historyFromMessages([
      m('user', 'u1', 'fix README', { ...human, timestamp: '2026-09-20T10:00:00.000Z' }),
      m('assistant', 'a1', [{ type: 'text', text: 'Looking' }]),
      m('assistant', 'a2', [
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'README.md' } },
      ]),
      m('user', 'u2', [{ type: 'tool_result', tool_use_id: 't1', content: 'body' }]),
      m('assistant', 'a3', [
        { type: 'tool_use', id: 'ag', name: 'Agent', input: { description: 'x' } },
      ]),
      m('assistant', 'a4', [{ type: 'tool_use', id: 'c1', name: 'Grep', input: {} }], {
        parent_tool_use_id: 'ag',
      }),
      m('user', 'u3', [{ type: 'tool_result', tool_use_id: 'c1', content: 'hit' }], {
        parent_tool_use_id: 'ag',
      }),
      m('assistant', 'a5', [{ type: 'text', text: 'sub says' }], { parent_tool_use_id: 'ag' }),
      m('user', 'u4', [{ type: 'tool_result', tool_use_id: 'ag', content: 'agent done' }]),
      m('assistant', 'a6', [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'Done' },
      ]),
      m('system', 'x1', undefined),
      m('user', 'u5', [{ type: 'text', text: 'hook feedback' }], { origin: { kind: 'hook' } }),
      m('user', 'u6', [{ type: 'text', text: 'thanks' }], {
        ...human,
        timestamp: '2026-09-20T10:05:00.000Z',
      }),
      m('assistant', 'a7', [{ type: 'text', text: 'You are welcome' }]),
    ]);
    assert.deepStrictEqual(turns, [
      {
        prompt: 'fix README',
        startedAt: '2026-09-20T10:00:00.000Z',
        lastMessageUuid: 'a6',
        events: [
          { type: 'text', text: 'Looking' },
          { type: 'tool-call', id: 't1', name: 'Read', input: { file_path: 'README.md' } },
          { type: 'tool-result', id: 't1', ok: true, output: 'body' },
          { type: 'tool-call', id: 'ag', name: 'Agent', input: { description: 'x' } },
          { type: 'tool-call', id: 'c1', name: 'Grep', input: {}, parentId: 'ag' },
          { type: 'tool-result', id: 'c1', ok: true, output: 'hit' },
          { type: 'tool-result', id: 'ag', ok: true, output: 'agent done' },
          { type: 'text', text: 'Done' },
          { type: 'turn-end', ok: true },
        ],
      },
      {
        prompt: 'thanks',
        startedAt: '2026-09-20T10:05:00.000Z',
        lastMessageUuid: 'a7',
        events: [
          { type: 'text', text: 'You are welcome' },
          { type: 'turn-end', ok: true },
        ],
      },
    ]);
  });

  test('最初の人の指示より前のメッセージは捨てる', () => {
    const turns = historyFromMessages([
      m('assistant', 'a0', [{ type: 'text', text: 'orphan' }]),
      m('user', 'u1', 'go', human),
    ]);
    assert.deepStrictEqual(turns, [{ prompt: 'go', events: [{ type: 'turn-end', ok: true }] }]);
  });

  test('history は、セッションのメッセージを読んで変換する', async () => {
    const calls: unknown[][] = [];
    const catalog = new AgentSdkSessionCatalog({
      listSessions: async () => [],
      getSessionMessages: async (...args) => {
        calls.push(args);
        return [m('user', 'u1', 'hi', human)] as never;
      },
    });
    assert.deepStrictEqual(await catalog.history('s1', 'D:\\w'), [
      { prompt: 'hi', events: [{ type: 'turn-end', ok: true }] },
    ]);
    assert.deepStrictEqual(calls, [['s1', { dir: 'D:\\w' }]]);
  });
});
