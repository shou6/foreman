import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App } from './App';
import type { PanelState, ToExtension, ToWebview } from './protocol';
import { reduce } from './state';
import './styles.css';

declare function acquireVsCodeApi(): { postMessage(message: ToExtension): void };

const vscode = acquireVsCodeApi();

function Root() {
  const [state, setState] = useState<PanelState | undefined>(undefined);
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      setState((current) => reduce(current, e.data as ToWebview));
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [state?.items.length, state?.status]);
  return <App state={state} post={(message) => vscode.postMessage(message)} />;
}

render(<Root />, document.body);
