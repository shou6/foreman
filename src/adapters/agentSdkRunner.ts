import type {
  CanUseTool,
  HookCallback,
  Options,
  PermissionMode as SdkPermissionMode,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };
import type { PermissionRequest, RunnerEvent } from '../domain/events';
import { EFFORT_LEVELS } from '../domain/models';
import type { PermissionMode, PermissionRule, Usage } from '../domain/task';
import type { AgentRunner, RunHandle, StartOptions } from '../ports/agentRunner';

/*
 * Agent SDK との境界。SDK の型はこのファイルの外へ出さず、domain/events.ts の形に正規化する。
 * 使い方の根拠は docs/spike-results.md
 */

export type SdkMessage = SDKMessage;

/** SDK の query()。テストではフェイクに差し替える */
export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Query;

export interface AgentSdkRunnerDeps {
  query: QueryFn;
  /** ユーザーの claude CLI の場所 */
  claudePath: () => string;
  /** SDK の stderr などの記録 */
  log?: (line: string) => void;
}

const EDIT_TOOLS = 'Edit|Write|MultiEdit|NotebookEdit';

/** SDK のメッセージを RunnerEvent に正規化する。知らない種類は空 */
export function normalizeMessage(m: SDKMessage): RunnerEvent[] {
  switch (m.type) {
    case 'system':
      return m.subtype === 'init'
        ? [{ type: 'init', sessionId: m.session_id, model: m.model }]
        : [];
    case 'stream_event': {
      const event = m.event;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        return [{ type: 'text', text: event.delta.text }];
      }
      return [];
    }
    case 'assistant':
      return m.message.content.flatMap((block) =>
        block.type === 'tool_use'
          ? [{ type: 'tool-call', id: block.id, name: block.name, input: asRecord(block.input) }]
          : []
      );
    case 'user': {
      const content = m.message.content;
      if (typeof content === 'string') {
        return [];
      }
      return content.flatMap((block) =>
        block.type === 'tool_result'
          ? [
              {
                type: 'tool-result',
                id: block.tool_use_id,
                ok: block.is_error !== true,
                output: flattenContent(block.content),
              },
            ]
          : []
      );
    }
    case 'result':
      if (m.subtype === 'success' && m.is_error) {
        // 未ログインなど、Claude が動けなかった。案内の文は result に入る
        return [{ type: 'turn-end', ok: false, interrupted: false, reason: m.result }];
      }
      if (m.subtype === 'success') {
        return [{ type: 'turn-end', ok: true, usage: usageOf(m) }];
      }
      return [{ type: 'turn-end', ok: false, interrupted: false, reason: reasonOf(m) }];
    default:
      return [];
  }
}

/** assistant メッセージの text ブロックをつないだもの。text ブロックが無ければ undefined */
function finalTextOf(m: SDKMessage): string | undefined {
  if (m.type !== 'assistant') {
    return undefined;
  }
  const texts = m.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
  return texts.length === 0 ? undefined : texts.join('');
}

/**
 * 「このタスクでは常に許可」で保存した内容を、起動時の SDK のオプションへ写す。
 * setMode は acceptEdits までしか写さない（より緩いモードは Foreman では使わない）
 */
export function sdkOptionsFromAlwaysAllowed(
  mode: PermissionMode,
  rules: readonly PermissionRule[]
): { permissionMode: PermissionMode; allowedTools: string[] } {
  let permissionMode: PermissionMode = mode;
  const allowedTools: string[] = [];
  for (const rule of rules) {
    if (rule.type === 'setMode' && rule.mode === 'acceptEdits') {
      permissionMode = 'acceptEdits';
    } else if (rule.type === 'addRules' && rule.behavior === 'allow' && Array.isArray(rule.rules)) {
      for (const r of rule.rules) {
        const value = asRecord(r);
        if (typeof value.toolName === 'string') {
          allowedTools.push(
            typeof value.ruleContent === 'string'
              ? `${value.toolName}(${value.ruleContent})`
              : value.toolName
          );
        }
      }
    }
  }
  return { permissionMode, allowedTools };
}

export class AgentSdkRunner implements AgentRunner {
  constructor(private readonly deps: AgentSdkRunnerDeps) {}

  start(options: StartOptions): RunHandle {
    return this.run(undefined, options);
  }

  resume(sessionId: string, options: StartOptions): RunHandle {
    return this.run(sessionId, options);
  }

  private run(sessionId: string | undefined, options: StartOptions): RunHandle {
    let claudePath: string;
    try {
      claudePath = this.deps.claudePath();
    } catch (error) {
      return failedHandle(options, messageOf(error));
    }
    const prompts = new PromptStream();
    prompts.push(options.prompt);
    const perms = sdkOptionsFromAlwaysAllowed(options.permissionMode, options.alwaysAllowed);
    let interruptRequested = false;
    let turnOpen = true;

    const emitTurnEnd = (event: RunnerEvent & { type: 'turn-end' }): void => {
      if (!turnOpen) {
        return;
      }
      turnOpen = false;
      const withInterrupt: RunnerEvent =
        !event.ok && interruptRequested ? { ...event, interrupted: true } : event;
      interruptRequested = false;
      options.onEvent(withInterrupt);
    };

    const canUseTool: CanUseTool = async (toolName, input, { suggestions }) => {
      const request: PermissionRequest = { toolName, input, suggestions: suggestions ?? [] };
      const decision = await options.onPermissionRequest(request);
      switch (decision.behavior) {
        case 'allow':
          return { behavior: 'allow', updatedInput: decision.updatedInput ?? input };
        case 'allow-always':
          return {
            behavior: 'allow',
            updatedInput: input,
            // 「このタスクでは常に許可」。SDK の提案が設定ファイル宛てでも、このセッションだけに効かせる
            updatedPermissions: decision.permissions.map((p) => ({
              ...p,
              destination: 'session',
            })) as PermissionUpdate[],
          };
        case 'deny':
          return { behavior: 'deny', message: decision.message };
      }
    };

    const fileEditHook =
      (phase: 'before' | 'after'): HookCallback =>
      async (input) => {
        if (input.hook_event_name === 'PreToolUse' || input.hook_event_name === 'PostToolUse') {
          const target = asRecord(input.tool_input);
          const file = target.file_path ?? target.notebook_path;
          if (typeof file === 'string') {
            options.onEvent({ type: 'file-edit', phase, path: file });
          }
        }
        return { continue: true };
      };

    const query = this.deps.query({
      prompt: prompts,
      options: {
        cwd: options.cwd,
        model: options.model,
        effort: options.effort,
        resume: sessionId,
        resumeSessionAt: options.resumeAt,
        forkSession: options.fork === true ? true : undefined,
        pathToClaudeCodeExecutable: claudePath,
        includePartialMessages: true,
        permissionMode: perms.permissionMode as SdkPermissionMode,
        allowedTools: perms.allowedTools,
        canUseTool,
        hooks: {
          PreToolUse: [{ matcher: EDIT_TOOLS, hooks: [fileEditHook('before')] }],
          PostToolUse: [{ matcher: EDIT_TOOLS, hooks: [fileEditHook('after')] }],
        },
        stderr: (data) => this.deps.log?.(data),
      },
    });

    // セッションが次に使う Effort を聞いて知らせる。getSettings は SDK の型定義に無い
    // （公開された使い方ではない）ので、無い・失敗した時は何も知らせずに動き続ける
    const reportEffort = async (): Promise<void> => {
      const getSettings = (query as unknown as { getSettings?: () => Promise<unknown> })
        .getSettings;
      if (typeof getSettings !== 'function') {
        return;
      }
      try {
        const applied = asRecord(asRecord(await getSettings.call(query)).applied);
        options.onEvent({
          type: 'effort',
          effort: EFFORT_LEVELS.find((level) => level === applied.effort),
        });
      } catch {
        // 聞けなくても、ターンは動かせる
      }
    };
    void reportEffort();

    let lastAssistantUuid: string | undefined;
    // 前回の確定からこれまでに流した断片の文字数。assistant の text で置き換える
    let streamed = 0;
    const done = (async () => {
      try {
        for await (const message of query) {
          if (message.type === 'assistant' && (message.parent_tool_use_id ?? null) === null) {
            lastAssistantUuid = message.uuid;
          }
          const finalText = finalTextOf(message);
          if (finalText !== undefined) {
            options.onEvent({ type: 'text-final', text: finalText, streamed });
            streamed = 0;
          }
          for (const event of normalizeMessage(message)) {
            if (event.type === 'turn-end') {
              emitTurnEnd(event.ok ? { ...event, lastMessageUuid: lastAssistantUuid } : event);
              lastAssistantUuid = undefined;
              streamed = 0;
            } else {
              if (event.type === 'text') {
                streamed += event.text.length;
              }
              options.onEvent(event);
            }
          }
        }
      } catch (error) {
        emitTurnEnd({ type: 'turn-end', ok: false, interrupted: false, reason: messageOf(error) });
      } finally {
        prompts.end();
      }
    })();

    return {
      send: (prompt) => {
        turnOpen = true;
        prompts.push(prompt);
      },
      interrupt: async () => {
        interruptRequested = true;
        await query.interrupt();
      },
      setModel: async (model) => {
        await query.setModel(model);
        // モデルが変わると、使われる Effort も変わる
        await reportEffort();
      },
      // Effort は途中で変えられるフラグ設定で伝える。null で Claude Code の既定に戻る
      setEffort: async (effort) => {
        await query.applyFlagSettings({ effortLevel: effort ?? null });
        await reportEffort();
      },
      close: () => prompts.end(),
      done,
    };
  }
}

/** ストリーミング入力。push した指示を順に SDK へ渡し、end で閉じてプロセスを終わらせる */
class PromptStream implements AsyncIterable<SDKUserMessage> {
  private readonly queue: SDKUserMessage[] = [];
  private closed = false;
  private wake: (() => void) | undefined;

  push(prompt: string): void {
    this.queue.push({
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: { role: 'user', content: prompt },
    });
    this.wake?.();
  }

  end(): void {
    this.closed = true;
    this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage, void> {
    for (;;) {
      const next = this.queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.closed) {
        return;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = undefined;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const b = asRecord(block);
        return b.type === 'text' && typeof b.text === 'string' ? b.text : '';
      })
      .join('');
  }
  return '';
}

function usageOf(m: SDKMessage & { type: 'result'; subtype: 'success' }): Usage {
  const usage = asRecord(m.usage);
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const contextWindow = Object.values(asRecord(m.modelUsage)).reduce<number>(
    (max, entry) => Math.max(max, num(asRecord(entry).contextWindow)),
    0
  );
  return {
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    cacheReadInputTokens: num(usage.cache_read_input_tokens),
    cacheCreationInputTokens: num(usage.cache_creation_input_tokens),
    contextWindow,
  };
}

function reasonOf(m: SDKMessage & { type: 'result' }): string {
  const errors = asRecord(m).errors;
  const detail = Array.isArray(errors)
    ? errors.filter((e) => typeof e === 'string').join('; ')
    : '';
  return detail === '' ? m.subtype : `${m.subtype}: ${detail}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 起動できなかった時のハンドル。失敗の turn-end を非同期に 1 回出し、すぐに終わる */
function failedHandle(options: StartOptions, reason: string): RunHandle {
  queueMicrotask(() =>
    options.onEvent({ type: 'turn-end', ok: false, interrupted: false, reason })
  );
  return {
    send: () => {},
    interrupt: async () => {},
    setModel: async () => {},
    setEffort: async () => {},
    close: () => {},
    done: Promise.resolve(),
  };
}
