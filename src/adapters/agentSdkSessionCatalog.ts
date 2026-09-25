import type {
  GetSessionMessagesOptions,
  ListSessionsOptions,
  SDKSessionInfo,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };
import type { RunnerEvent } from '../domain/events';
import type { ImportedTurn, SessionSummary } from '../domain/sessions';
import type { SessionCatalog } from '../ports/sessionCatalog';

/** SDK のセッションの関数のうち、使う分だけ。テストではフェイクに差し替える */
export interface SessionFns {
  listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
  getSessionMessages(
    sessionId: string,
    options?: GetSessionMessagesOptions
  ): Promise<SessionMessage[]>;
}

/**
 * 手元に保存された Claude Code のセッションを読む。claude は起動しないので、トークンや契約の枠は使わない
 */
export class AgentSdkSessionCatalog implements SessionCatalog {
  constructor(private readonly fns: SessionFns) {}

  async list(dir: string): Promise<SessionSummary[]> {
    const sessions = await this.fns.listSessions({ dir });
    return [...sessions]
      .sort((a, b) => b.lastModified - a.lastModified)
      .map((s) => ({
        sessionId: s.sessionId,
        title: s.customTitle ?? s.summary,
        lastModified: s.lastModified,
        ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
        ...(s.gitBranch !== undefined ? { gitBranch: s.gitBranch } : {}),
        ...(s.firstPrompt !== undefined ? { firstPrompt: s.firstPrompt } : {}),
      }));
  }

  async history(sessionId: string, dir: string): Promise<ImportedTurn[]> {
    return historyFromMessages(await this.fns.getSessionMessages(sessionId, { dir }));
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function blocksOf(m: SessionMessage): unknown[] | string {
  const content = asRecord(m.message).content;
  return typeof content === 'string' ? content : Array.isArray(content) ? content : [];
}

function flatten(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return Array.isArray(content)
    ? content
        .map((block) => {
          const b = asRecord(block);
          return b.type === 'text' && typeof b.text === 'string' ? b.text : '';
        })
        .join('')
    : '';
}

/**
 * 人が書いた指示なら、その文。ツールの結果や、フックなど人以外が足したメッセージは undefined。
 * origin の無い古いセッションは、文があれば人の指示とみなす
 */
function humanPrompt(m: SessionMessage): string | undefined {
  if (m.type !== 'user' || m.parent_tool_use_id !== null) {
    return undefined;
  }
  const origin = asRecord((m as { origin?: unknown }).origin);
  if (origin.kind !== undefined && origin.kind !== 'human') {
    return undefined;
  }
  const blocks = blocksOf(m);
  if (typeof blocks === 'string') {
    return blocks.trim() === '' ? undefined : blocks;
  }
  const texts = blocks.flatMap((block) => {
    const b = asRecord(block);
    return b.type === 'text' && typeof b.text === 'string' ? [b.text] : [];
  });
  const text = texts.join('\n');
  return text.trim() === '' ? undefined : text;
}

/**
 * セッションのメッセージを、人の指示ごとのターンに分ける。
 * 出力の文（サブエージェントの文は除く）とツールの呼び出し・結果をイベントにし、各ターンを turn-end で閉じる。
 * 最初の人の指示より前のメッセージは捨てる
 */
export function historyFromMessages(messages: readonly SessionMessage[]): ImportedTurn[] {
  const turns: ImportedTurn[] = [];
  let current: ImportedTurn | undefined;
  const close = (): void => {
    if (current !== undefined) {
      current.events.push({ type: 'turn-end', ok: true });
      turns.push(current);
    }
  };
  for (const m of messages) {
    const prompt = humanPrompt(m);
    if (prompt !== undefined) {
      close();
      const timestamp = (m as { timestamp?: unknown }).timestamp;
      current = {
        prompt,
        ...(typeof timestamp === 'string' ? { startedAt: timestamp } : {}),
        events: [],
      };
      continue;
    }
    if (current === undefined) {
      continue;
    }
    const blocks = blocksOf(m);
    if (typeof blocks === 'string') {
      continue;
    }
    const parentId = m.parent_tool_use_id ?? undefined;
    if (m.type === 'assistant') {
      if (parentId === undefined) {
        current.lastMessageUuid = m.uuid;
      }
      for (const block of blocks) {
        const b = asRecord(block);
        if (b.type === 'text' && typeof b.text === 'string' && parentId === undefined) {
          current.events.push({ type: 'text', text: b.text });
        } else if (
          b.type === 'tool_use' &&
          typeof b.id === 'string' &&
          typeof b.name === 'string'
        ) {
          const event: RunnerEvent = {
            type: 'tool-call',
            id: b.id,
            name: b.name,
            input: asRecord(b.input),
            ...(parentId !== undefined ? { parentId } : {}),
          };
          current.events.push(event);
        }
      }
    } else if (m.type === 'user') {
      for (const block of blocks) {
        const b = asRecord(block);
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          current.events.push({
            type: 'tool-result',
            id: b.tool_use_id,
            ok: b.is_error !== true,
            output: flatten(b.content),
          });
        }
      }
    }
  }
  close();
  return turns;
}
