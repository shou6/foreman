import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { BoardState, FromBoard, ToBoard } from '../boardProtocol';
import { Board } from './Board';
import './board.css';

declare function acquireVsCodeApi(): { postMessage(message: FromBoard): void };

const vscode = acquireVsCodeApi();

function Root() {
  const [state, setState] = useState<BoardState | undefined>(undefined);
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const message = e.data as ToBoard;
      if (message.type === 'state') {
        setState(message.state);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <Board state={state} post={(message) => vscode.postMessage(message)} />;
}

render(<Root />, document.body);
