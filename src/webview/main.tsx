import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import 'overlayscrollbars/overlayscrollbars.css';
import { OverlayScrollbars } from 'overlayscrollbars';
import { App } from './App';
import type { PanelState, ToExtension, ToWebview } from './protocol';
import { reduce } from './state';
import { enhanceScrollbars, Scroll } from './Scroll';
import './styles.css';

interface WebviewState {
  draft?: string;
}

declare function acquireVsCodeApi(): {
  postMessage(message: ToExtension): void;
  getState(): WebviewState | undefined;
  setState(state: WebviewState): void;
};

const vscode = acquireVsCodeApi();

/** エクスプローラーやタブからのドロップ。VS Code は text/uri-list で URI を渡す */
function urisOf(transfer: DataTransfer | null): string[] {
  const list = transfer?.getData('text/uri-list') ?? '';
  return list
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function Root() {
  const [state, setState] = useState<PanelState | undefined>(undefined);
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      setState((current) => reduce(current, e.data as ToWebview));
    };
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault();
      document.body.classList.add('dragging');
    };
    const onDragLeave = (): void => document.body.classList.remove('dragging');
    // クリップボードの画像（スクリーンショットなど）は、拡張機能に渡して保存してもらう
    const onPaste = (e: ClipboardEvent): void => {
      const items = [...(e.clipboardData?.items ?? [])].filter((item) =>
        item.type.startsWith('image/')
      );
      if (items.length === 0) {
        return;
      }
      e.preventDefault();
      for (const item of items) {
        const file = item.getAsFile();
        if (file === null) {
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const url = typeof reader.result === 'string' ? reader.result : '';
          const data = url.slice(url.indexOf(',') + 1);
          if (data !== '') {
            vscode.postMessage({ type: 'pasteImage', mime: item.type, data });
          }
        };
        reader.readAsDataURL(file);
      }
    };
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      document.body.classList.remove('dragging');
      const uris = urisOf(e.dataTransfer);
      if (uris.length > 0) {
        vscode.postMessage({ type: 'dropped', uris });
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    vscode.postMessage({ type: 'ready' });
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
  // ページのスクロールは Scroll の中の要素で行う（window はスクロールしない）
  const page = useRef<HTMLElement | undefined>(undefined);
  useEffect(() => {
    page.current?.scrollTo(0, page.current.scrollHeight);
  }, [state?.items.length, state?.status, state?.pending?.id]);
  useEffect(() => enhanceScrollbars(document.body), []);
  return (
    <Scroll
      class="page"
      onViewport={(viewport) => {
        page.current = viewport;
        viewport.scrollTo(0, viewport.scrollHeight);
      }}
    >
      <App
        state={state}
        post={(message) => vscode.postMessage(message)}
        initialDraft={vscode.getState()?.draft}
        onDraftChange={(draft) => vscode.setState({ draft })}
      />
    </Scroll>
  );
}

// スクロールバーが環境の判定に使う style 要素に、スクリプトと同じ nonce を付ける（CSP で許すため）
const nonce = (document.currentScript as HTMLScriptElement | null)?.nonce;
if (nonce !== undefined && nonce !== '') {
  OverlayScrollbars.nonce(nonce);
}

render(<Root />, document.body);
