import { applyEvent, startTurn } from '../domain/transcript';
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
        title: message.title,
        model: message.model,
        activeModel: message.activeModel,
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
      return { ...state, attachments: message.paths };
    case 'finishing':
      return { ...state, finishing: message.kind };
    case 'turn-start':
      return { ...state, items: startTurn(state.items, message.turn, message.prompt) };
    case 'event':
      return { ...state, items: applyEvent(state.items, message.turn, message.event) };
  }
}
