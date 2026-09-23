import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DetailsState, FromDetails, ToDetails } from '../detailsProtocol';
import { Details } from './Details';
import './details.css';

declare function acquireVsCodeApi(): { postMessage(message: FromDetails): void };

const vscode = acquireVsCodeApi();

function Root() {
  const [state, setState] = useState<DetailsState | undefined>(undefined);
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const message = e.data as ToDetails;
      if (message.type === 'state') {
        setState(message.state);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <Details state={state} post={(message) => vscode.postMessage(message)} />;
}

render(<Root />, document.body);
