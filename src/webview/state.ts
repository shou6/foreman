import { applyEvent, startTurn, truncateAfter } from '../domain/transcript';
import { diffKey, type PanelState, type ToWebview } from './protocol';

/** 拡張機能からのメッセージを画面の状態に反映する。state が届くまでは何もしない */
export function reduce(state: PanelState | undefined, message: ToWebview): PanelState | undefined {
  if (message.type === 'state') {
    return message.state;
  }
  if (state === undefined) {
    return undefined;
  }
  switch (message.type) {
    case 'task':
      return {
        ...state,
        status: message.status,
        turnOpen: message.turnOpen,
        turnStartedAt: message.turnStartedAt,
        mergeable: message.mergeable,
        unapprovable: message.unapprovable,
        usage: message.usage,
        tokens: message.tokens,
        title: message.title,
        model: message.model,
        activeModel: message.activeModel,
        effort: message.effort,
        activeEffort: message.activeEffort,
        permissionMode: message.permissionMode,
        worktree: message.worktree,
      };
    case 'pending':
      return { ...state, pending: message.pending };
    case 'changes':
      return { ...state, changes: { ...state.changes, [message.turn]: message.changes } };
    case 'diff':
      return {
        ...state,
        diffs: { ...state.diffs, [diffKey(message.turn, message.path)]: message.lines },
      };
    case 'attachments':
      return { ...state, attachments: message.attachments };
    case 'finishing':
      return { ...state, finishing: message.kind };
    case 'models':
      return { ...state, models: message.models, defaultModel: message.defaultModel };
    case 'commands':
      return { ...state, commands: message.commands };
    case 'mcp':
      return { ...state, mcp: message.mcp };
    case 'turn-start':
      return { ...state, items: startTurn(state.items, message.turn, message.prompt) };
    case 'event':
      return { ...state, items: applyEvent(state.items, message.turn, message.event) };
    case 'truncate': {
      const keep = (turn: number): boolean => turn <= message.afterTurn;
      return {
        ...state,
        items: truncateAfter(state.items, message.afterTurn),
        changes: Object.fromEntries(
          Object.entries(state.changes).filter(([turn]) => keep(Number(turn)))
        ),
        diffs: Object.fromEntries(
          Object.entries(state.diffs).filter(([key]) => keep(Number(key.split(':')[0])))
        ),
      };
    }
  }
}
