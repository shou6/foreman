import { applyEvent, startTurn } from '../domain/transcript';
import type { PanelState, ToWebview } from './protocol';

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
      return { ...state, status: message.status, title: message.title, model: message.model };
    case 'turn-start':
      return { ...state, items: startTurn(state.items, message.turn, message.prompt) };
    case 'event':
      return { ...state, items: applyEvent(state.items, message.turn, message.event) };
  }
}
