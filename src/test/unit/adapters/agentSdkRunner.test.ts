import * as assert from 'assert';
import {
  AgentSdkRunner,
  normalizeMessage,
  sdkOptionsFromAlwaysAllowed,
  type QueryFn,
  type SdkMessage,
} from '../../../adapters/agentSdkRunner';
import type { PermissionDecision, RunnerEvent } from '../../../domain/events';

/** SDK のメッセージの最小限の形。型は adapters の外に出さないので、テストでは unknown 経由で作る */
const msg = (m: Record<string, unknown>): SdkMessage => m as unknown as SdkMessage;

suite('normalizeMessage', () => {
  test('system/init → init', () => {
    assert.deepStrictEqual(
      normalizeMessage(
        msg({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-5' })
      ),
      [{ type: 'init', sessionId: 's1', model: 'claude-opus-5' }]
    );
  });

  test('stream_event の text_delta → text。それ以外の断片は無視', () => {
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'po' } },
        })
      ),
      [{ type: 'text', text: 'po' }]
    );
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '…' } },
        })
      ),
      []
    );
    assert.deepStrictEqual(
      normalizeMessage(msg({ type: 'stream_event', event: { type: 'message_start' } })),
      []
    );
  });

  test('assistant の tool_use → tool-call。text はストリームで届いているので出さない', () => {
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I will edit' },
              { type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: 'a.txt' } },
            ],
          },
        })
      ),
      [{ type: 'tool-call', id: 'tu1', name: 'Edit', input: { file_path: 'a.txt' } }]
    );
  });

  test('user の tool_result → tool-result。内容は文字列に平らにする', () => {
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tu1', content: 'ok' },
              {
                type: 'tool_result',
                tool_use_id: 'tu2',
                is_error: true,
                content: [{ type: 'text', text: 'boom' }],
              },
            ],
          },
        })
      ),
      [
        { type: 'tool-result', id: 'tu1', ok: true, output: 'ok' },
        { type: 'tool-result', id: 'tu2', ok: false, output: 'boom' },
      ]
    );
  });

  test('user の文字列の内容（指示の echo）は無視する', () => {
    assert.deepStrictEqual(
      normalizeMessage(msg({ type: 'user', message: { role: 'user', content: 'hello' } })),
      []
    );
  });

  test('result/success → turn-end ok。usage はメインの会話の値と、最大の contextWindow', () => {
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'result',
          subtype: 'success',
          is_error: false,
          usage: {
            input_tokens: 4,
            output_tokens: 207,
            cache_read_input_tokens: 19809,
            cache_creation_input_tokens: 3532,
          },
          modelUsage: {
            'claude-haiku-4-5': { contextWindow: 200000 },
            'claude-opus-5[1m]': { contextWindow: 1000000 },
          },
        })
      ),
      [
        {
          type: 'turn-end',
          ok: true,
          usage: {
            inputTokens: 4,
            outputTokens: 207,
            cacheReadInputTokens: 19809,
            cacheCreationInputTokens: 3532,
            contextWindow: 1000000,
          },
        },
      ]
    );
  });

  test('result のエラー → turn-end ok:false。理由は subtype とエラーの文言', () => {
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'result',
          subtype: 'error_max_turns',
          is_error: true,
          errors: ['Reached maximum number of turns (1)'],
        })
      ),
      [
        {
          type: 'turn-end',
          ok: false,
          interrupted: false,
          reason: 'error_max_turns: Reached maximum number of turns (1)',
        },
      ]
    );
  });

  test('subtype が success でも is_error なら失敗。理由は result の文（未ログインなど）', () => {
    // ログインしていない claude は、success・is_error・result に案内の文を返す（2026-09-25 に実機で確認）
    assert.deepStrictEqual(
      normalizeMessage(
        msg({
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: 'Not logged in · Please run /login',
          usage: {},
          modelUsage: {},
        })
      ),
      [
        {
          type: 'turn-end',
          ok: false,
          interrupted: false,
          reason: 'Not logged in · Please run /login',
        },
      ]
    );
  });

  test('知らない種類は無視する', () => {
    assert.deepStrictEqual(normalizeMessage(msg({ type: 'rate_limit_event' })), []);
    assert.deepStrictEqual(normalizeMessage(msg({ type: 'system', subtype: 'status' })), []);
  });
});

suite('sdkOptionsFromAlwaysAllowed', () => {
  test('setMode は permissionMode に、addRules は allowedTools に写す', () => {
    assert.deepStrictEqual(
      sdkOptionsFromAlwaysAllowed('default', [
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
        {
          type: 'addRules',
          behavior: 'allow',
          destination: 'session',
          rules: [{ toolName: 'Bash', ruleContent: 'npm test' }, { toolName: 'WebFetch' }],
        },
      ]),
      { permissionMode: 'acceptEdits', allowedTools: ['Bash(npm test)', 'WebFetch'] }
    );
  });

  test('保存が無ければ、タスクの承認方式だけ', () => {
    assert.deepStrictEqual(sdkOptionsFromAlwaysAllowed('acceptEdits', []), {
      permissionMode: 'acceptEdits',
      allowedTools: [],
    });
  });

  test('setMode でも、より緩い bypassPermissions などには写さない', () => {
    assert.deepStrictEqual(
      sdkOptionsFromAlwaysAllowed('default', [
        { type: 'setMode', mode: 'bypassPermissions', destination: 'session' },
      ]),
      { permissionMode: 'default', allowedTools: [] }
    );
  });
});

/** 台本どおりにメッセージを流す query() のフェイク */
interface FakeQuery {
  params: Parameters<QueryFn>[0][];
  interrupts: number;
  models: (string | undefined)[];
  /** 台本を進める。null で終了、Error で例外 */
  push: (m: SdkMessage | null | Error) => void;
  canUseTool: (
    name: string,
    input: Record<string, unknown>,
    suggestions: unknown[]
  ) => Promise<unknown>;
  /** 送られた指示（prompt の AsyncIterable を読む） */
  prompts: string[];
  /** applyFlagSettings に渡された設定 */
  flags: Record<string, unknown>[];
  /** getSettings が返す、次に使う Effort。undefined なら getSettings を持たない（古い SDK） */
  appliedEffort?: string | null;
}

function fakeQuery(): { query: QueryFn; fake: FakeQuery } {
  const queue: (SdkMessage | null | Error)[] = [];
  let wake: (() => void) | undefined;
  const fake: FakeQuery = {
    params: [],
    interrupts: 0,
    models: [],
    flags: [],
    prompts: [],
    push: (m) => {
      queue.push(m);
      wake?.();
    },
    canUseTool: async () => {
      throw new Error('canUseTool not set');
    },
  };
  const query: QueryFn = (params) => {
    fake.params.push(params);
    const opts = params.options;
    if (opts?.canUseTool) {
      const cb = opts.canUseTool;
      fake.canUseTool = (name, input, suggestions) =>
        cb(name, input, {
          signal: new AbortController().signal,
          suggestions,
        } as Parameters<typeof cb>[2]);
    }
    // 指示の読み取り。テストの都合で読んだものを記録するだけ
    void (async () => {
      for await (const m of params.prompt) {
        const content = m.message.content;
        fake.prompts.push(typeof content === 'string' ? content : JSON.stringify(content));
      }
    })();
    const iterator = {
      async next(): Promise<IteratorResult<SdkMessage, void>> {
        while (queue.length === 0) {
          await new Promise<void>((resolve) => (wake = resolve));
        }
        const m = queue.shift();
        if (m === null || m === undefined) {
          return { done: true, value: undefined };
        }
        if (m instanceof Error) {
          throw m;
        }
        return { done: false, value: m };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
      interrupt: async () => {
        fake.interrupts++;
        return undefined;
      },
      setModel: async (model?: string) => {
        fake.models.push(model);
      },
      applyFlagSettings: async (settings: Record<string, unknown>) => {
        fake.flags.push(settings);
      },
      getSettings:
        fake.appliedEffort === undefined
          ? undefined
          : async () => ({ applied: { effort: fake.appliedEffort } }),
    };
    return iterator as unknown as ReturnType<QueryFn>;
  };
  return { query, fake };
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

suite('AgentSdkRunner', () => {
  const base = {
    cwd: 'D:\\work',
    prompt: 'hello',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
  };

  test('起動時に cwd、実行ファイル、モデル、ストリーミングの設定を SDK へ渡し、最初の指示を送る', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'C:\\claude.exe' });
    runner.start({
      ...base,
      model: 'claude-sonnet-5',
      onEvent: () => {},
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    await settle();
    const opts = fake.params[0]?.options;
    assert.strictEqual(opts?.cwd, 'D:\\work');
    assert.strictEqual(opts?.pathToClaudeCodeExecutable, 'C:\\claude.exe');
    assert.strictEqual(opts?.model, 'claude-sonnet-5');
    assert.strictEqual(opts?.includePartialMessages, true);
    assert.strictEqual(opts?.permissionMode, 'default');
    assert.strictEqual(opts?.resume, undefined);
    assert.deepStrictEqual(fake.prompts, ['hello']);
  });

  test('再開時は resume に session_id を渡す', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    runner.resume('sess-1', {
      ...base,
      onEvent: () => {},
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    assert.strictEqual(fake.params[0]?.options?.resume, 'sess-1');
  });

  test('SDK のメッセージを正規化して onEvent へ流し、プロセスが終わると done が解決する', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    fake.push(msg({ type: 'system', subtype: 'init', session_id: 's1', model: 'm' }));
    fake.push(
      msg({ type: 'result', subtype: 'success', is_error: false, usage: {}, modelUsage: {} })
    );
    fake.push(null);
    await handle.done;
    assert.deepStrictEqual(
      events.map((e) => e.type),
      ['init', 'turn-end']
    );
  });

  test('追加の指示は同じ入力ストリームへ流れる', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const handle = runner.start({
      ...base,
      onEvent: () => {},
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    handle.send('second');
    await settle();
    assert.deepStrictEqual(fake.prompts, ['hello', 'second']);
  });

  test('interrupt すると SDK の interrupt を呼び、その後の失敗の result は中断として届く', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    await handle.interrupt();
    assert.strictEqual(fake.interrupts, 1);
    fake.push(msg({ type: 'result', subtype: 'error_during_execution', is_error: true }));
    await settle();
    assert.deepStrictEqual(events, [
      { type: 'turn-end', ok: false, interrupted: true, reason: 'error_during_execution' },
    ]);
  });

  test('ターンの途中で SDK が例外を投げたら、失敗の turn-end を出して done を解決する', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    fake.push(new Error('Claude Code process exited with code 1'));
    await handle.done;
    assert.deepStrictEqual(events, [
      {
        type: 'turn-end',
        ok: false,
        interrupted: false,
        reason: 'Claude Code process exited with code 1',
      },
    ]);
  });

  test('中断の直後に SDK が例外を投げても、二重に turn-end を出さない', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    await handle.interrupt();
    fake.push(msg({ type: 'result', subtype: 'error_during_execution', is_error: true }));
    fake.push(new Error('Claude Code process exited with code 1'));
    await handle.done;
    assert.strictEqual(events.filter((e) => e.type === 'turn-end').length, 1);
  });

  test('canUseTool は承認の要求に変換され、返事を SDK の形に戻す', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const decisions: PermissionDecision[] = [
      { behavior: 'allow' },
      { behavior: 'allow-always', permissions: [{ type: 'setMode', mode: 'acceptEdits' }] },
      { behavior: 'deny', message: 'no' },
    ];
    const requests: unknown[] = [];
    runner.start({
      ...base,
      onEvent: () => {},
      onPermissionRequest: async (request) => {
        requests.push(request);
        return decisions.shift() ?? { behavior: 'deny', message: 'none' };
      },
    });
    const suggestions = [{ type: 'setMode', mode: 'acceptEdits' }];
    assert.deepStrictEqual(await fake.canUseTool('Edit', { file_path: 'a' }, suggestions), {
      behavior: 'allow',
      updatedInput: { file_path: 'a' },
    });
    assert.deepStrictEqual(await fake.canUseTool('Edit', { file_path: 'b' }, suggestions), {
      behavior: 'allow',
      updatedInput: { file_path: 'b' },
      updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
    });
    assert.deepStrictEqual(await fake.canUseTool('Bash', { command: 'rm' }, []), {
      behavior: 'deny',
      message: 'no',
    });
    assert.deepStrictEqual(requests[0], {
      toolName: 'Edit',
      input: { file_path: 'a' },
      suggestions,
    });
  });

  test('保存した常に許可の内容は、permissionMode と allowedTools に写して起動する', () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    runner.start({
      ...base,
      alwaysAllowed: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
      onEvent: () => {},
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    assert.strictEqual(fake.params[0]?.options?.permissionMode, 'acceptEdits');
  });
});

suite('AgentSdkRunner: M3', () => {
  const base = {
    cwd: 'D:\\work',
    prompt: 'hello',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
  };

  test('allow に updatedInput があれば、それを SDK に返す（質問への答え）', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    runner.start({
      ...base,
      onEvent: () => {},
      onPermissionRequest: async () => ({
        behavior: 'allow',
        updatedInput: { questions: [], answers: { q: 'a' } },
      }),
    });
    assert.deepStrictEqual(await fake.canUseTool('AskUserQuestion', { questions: [] }, []), {
      behavior: 'allow',
      updatedInput: { questions: [], answers: { q: 'a' } },
    });
  });

  test('claude の場所が決まらなければ、起動せずに失敗の turn-end を出す', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({
      query,
      claudePath: () => {
        throw new Error('Claude Code CLI was not found');
      },
    });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    await handle.done;
    assert.strictEqual(fake.params.length, 0);
    assert.deepStrictEqual(events, [
      { type: 'turn-end', ok: false, interrupted: false, reason: 'Claude Code CLI was not found' },
    ]);
  });
});

suite('AgentSdkRunner: setModel', () => {
  test('setModel は SDK の setModel に渡す', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const handle = runner.start({
      cwd: 'D:\\work',
      prompt: 'hello',
      permissionMode: 'default',
      alwaysAllowed: [],
      onEvent: () => {},
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    await handle.setModel('claude-opus-5');
    await handle.setModel(undefined);
    assert.deepStrictEqual(fake.models, ['claude-opus-5', undefined]);
  });
});

suite('AgentSdkRunner: M9', () => {
  const base = {
    cwd: 'D:\\work',
    prompt: 'hello',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
  };

  test('turn-end に、そのターンの最後の assistant メッセージの uuid を付ける', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    fake.push(
      msg({ type: 'assistant', uuid: 'u1', message: { content: [{ type: 'text', text: 'a' }] } })
    );
    fake.push(
      msg({ type: 'assistant', uuid: 'u2', message: { content: [{ type: 'text', text: 'b' }] } })
    );
    fake.push(
      msg({ type: 'result', subtype: 'success', is_error: false, usage: {}, modelUsage: {} })
    );
    fake.push(null);
    await handle.done;
    const end = events.find((e) => e.type === 'turn-end');
    assert.ok(end?.type === 'turn-end' && end.ok);
    assert.strictEqual(end.lastMessageUuid, 'u2');
  });

  test('resumeAt と fork を SDK の resumeSessionAt と forkSession に渡す', () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    runner.resume('sess-1', {
      ...base,
      resumeAt: 'u1',
      fork: true,
      onEvent: () => {},
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    const opts = fake.params[0]?.options;
    assert.strictEqual(opts?.resume, 'sess-1');
    assert.strictEqual(opts?.resumeSessionAt, 'u1');
    assert.strictEqual(opts?.forkSession, true);
  });
});

suite('AgentSdkRunner: 出力の確定', () => {
  const base = {
    cwd: 'D:\\work',
    prompt: 'hello',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
  };
  const delta = (text: string) =>
    msg({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    });

  test('assistant の text ブロックが届いたら、それまでに流した断片の長さと一緒に text-final を出す', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    fake.push(delta('ok'));
    fake.push(delta('ok'));
    fake.push(
      msg({ type: 'assistant', uuid: 'u1', message: { content: [{ type: 'text', text: 'ok' }] } })
    );
    fake.push(delta('more'));
    fake.push(
      msg({
        type: 'assistant',
        uuid: 'u2',
        message: {
          content: [
            { type: 'text', text: 'more' },
            { type: 'tool_use', id: 't', name: 'Read', input: {} },
          ],
        },
      })
    );
    fake.push(null);
    await handle.done;
    assert.deepStrictEqual(
      events.filter((e) => e.type === 'text-final'),
      [
        { type: 'text-final', text: 'ok', streamed: 4 },
        { type: 'text-final', text: 'more', streamed: 4 },
      ]
    );
    const order = events.map((e) => e.type);
    assert.ok(
      order.indexOf('text-final') < order.indexOf('tool-call'),
      'text-final は tool-call より前'
    );
  });

  test('thinking だけの assistant メッセージでは出さない', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({
      ...base,
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => ({ behavior: 'allow' }),
    });
    fake.push(
      msg({
        type: 'assistant',
        uuid: 'u1',
        message: { content: [{ type: 'thinking', thinking: '' }] },
      })
    );
    fake.push(null);
    await handle.done;
    assert.strictEqual(
      events.some((e) => e.type === 'text-final'),
      false
    );
  });
});

suite('AgentSdkRunner: Effort', () => {
  const base = {
    cwd: 'D:\\work',
    prompt: 'hello',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
    onEvent: () => {},
    onPermissionRequest: async () => ({ behavior: 'allow' as const }),
  };

  test('起動時に Effort を SDK の effort に渡す。無ければ渡さない', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    runner.start({ ...base, effort: 'high' });
    runner.start({ ...base });
    await settle();
    assert.strictEqual(fake.params[0]?.options?.effort, 'high');
    assert.strictEqual(fake.params[1]?.options?.effort, undefined);
  });

  test('途中の変更は applyFlagSettings の effortLevel で伝える。既定に戻す時は null', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const handle = runner.start({ ...base });
    await handle.setEffort('low');
    await handle.setEffort(undefined);
    assert.deepStrictEqual(fake.flags, [{ effortLevel: 'low' }, { effortLevel: null }]);
  });
});

suite('AgentSdkRunner: 実際に使われる Effort', () => {
  const base = {
    cwd: 'D:\\work',
    prompt: 'hello',
    permissionMode: 'default' as const,
    alwaysAllowed: [],
    onPermissionRequest: async () => ({ behavior: 'allow' as const }),
  };

  test('起動した後に、セッションが次に使う Effort を聞いて effort のイベントで知らせる', async () => {
    const { query, fake } = fakeQuery();
    fake.appliedEffort = 'medium';
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    runner.start({ ...base, onEvent: (e) => events.push(e) });
    await settle();
    await settle();
    assert.deepStrictEqual(
      events.filter((e) => e.type === 'effort'),
      [{ type: 'effort', effort: 'medium' }]
    );
  });

  test('モデルや Effort を変えた後にも聞き直す。対応していないモデルは undefined', async () => {
    const { query, fake } = fakeQuery();
    fake.appliedEffort = 'medium';
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    const handle = runner.start({ ...base, onEvent: (e) => events.push(e) });
    await settle();
    fake.appliedEffort = null;
    await handle.setModel('haiku');
    fake.appliedEffort = 'high';
    await handle.setEffort('high');
    await settle();
    assert.deepStrictEqual(
      events.filter((e) => e.type === 'effort'),
      [
        { type: 'effort', effort: 'medium' },
        { type: 'effort', effort: undefined },
        { type: 'effort', effort: 'high' },
      ]
    );
  });

  test('getSettings が無い（使えなくなった）SDK では、何も知らせずに動き続ける', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const events: RunnerEvent[] = [];
    runner.start({ ...base, onEvent: (e) => events.push(e) });
    await settle();
    assert.strictEqual(fake.appliedEffort, undefined);
    assert.deepStrictEqual(
      events.filter((e) => e.type === 'effort'),
      []
    );
  });
});

suite('AgentSdkRunner: 常に許可の保存先', () => {
  test('SDK が提案した保存先が設定ファイルでも、返す時は session に固定する（このタスクだけに効かせる）', async () => {
    const { query, fake } = fakeQuery();
    const runner = new AgentSdkRunner({ query, claudePath: () => 'c' });
    const suggestions = [
      {
        type: 'addRules',
        behavior: 'allow',
        destination: 'localSettings',
        rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
      },
      { type: 'setMode', mode: 'acceptEdits', destination: 'userSettings' },
    ];
    runner.start({
      cwd: 'D:\\work',
      prompt: 'hello',
      permissionMode: 'default',
      alwaysAllowed: [],
      onEvent: () => {},
      onPermissionRequest: async (request) => ({
        behavior: 'allow-always',
        permissions: request.suggestions,
      }),
    });
    const result = (await fake.canUseTool('Bash', { command: 'npm test' }, suggestions)) as {
      updatedPermissions: { destination: string }[];
    };
    assert.deepStrictEqual(
      result.updatedPermissions.map((p) => p.destination),
      ['session', 'session']
    );
  });
});
