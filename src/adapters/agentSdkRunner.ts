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
      if (m.subtype === 'success') {
        return [{ type: 'turn-end', ok: true, usage: usageOf(m) }];
      }
      return [{ type: 'turn-end', ok: false, interrupted: false, reason: reasonOf(m) }];
    default:
      return [];
  }
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
            updatedPermissions: decision.permissions as PermissionUpdate[],
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
        resume: sessionId,
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

    const done = (async () => {
      try {
        for await (const message of query) {
          for (const event of normalizeMessage(message)) {
            if (event.type === 'turn-end') {
              emitTurnEnd(event);
            } else {
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
    close: () => {},
    done: Promise.resolve(),
  };
}
