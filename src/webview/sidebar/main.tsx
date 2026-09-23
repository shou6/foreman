import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { FromSidebar, SidebarState, ToSidebar } from '../sidebarProtocol';
import { Sidebar } from './Sidebar';
import './sidebar.css';

declare function acquireVsCodeApi(): { postMessage(message: FromSidebar): void };

const vscode = acquireVsCodeApi();

function Root() {
  const [state, setState] = useState<SidebarState | undefined>(undefined);
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const message = e.data as ToSidebar;
      if (message.type === 'state') {
        setState(message.state);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <Sidebar state={state} post={(message) => vscode.postMessage(message)} />;
}

render(<Root />, document.body);
