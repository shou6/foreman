import { useState } from 'preact/hooks';
import type { TranscriptItem } from '../domain/transcript';
import type { PanelState, ToExtension } from './protocol';

export interface AppProps {
  state: PanelState | undefined;
  post: (message: ToExtension) => void;
}

/** タスク画面。状態は拡張機能から届いたものをそのまま描く */
export function App({ state, post }: AppProps) {
  const [draft, setDraft] = useState('');
  if (state === undefined) {
    return null;
  }
  const busy = state.status === 'running' || state.status === 'waiting';
  const submit = (): void => {
    const prompt = draft.trim();
    if (prompt === '') {
      return;
    }
    post({ type: 'send', prompt });
    setDraft('');
  };
  return (
    <div class="panel">
      <header class="head">
        <h1 class="title">{state.title}</h1>
        <span class="status" data-status={state.status}>
          {state.status}
        </span>
        {state.model !== undefined && <span class="model">{state.model}</span>}
      </header>
      <main class="transcript">
        {state.items.map((item, i) => (
          <Item key={i} item={item} />
        ))}
        {state.status === 'running' && <div class="item running">{state.strings.running}</div>}
      </main>
      <footer class="composer">
        <textarea
          class="prompt-input"
          rows={3}
          value={draft}
          disabled={busy}
          onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button class="action stop" onClick={() => post({ type: 'interrupt' })}>
            {state.strings.stop}
          </button>
        ) : (
          <button class="action send" onClick={submit}>
            {state.strings.send}
          </button>
        )}
      </footer>
    </div>
  );
}

function Item({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case 'prompt':
      return <div class="item prompt">{item.text}</div>;
    case 'text':
      return <div class="item text">{item.text}</div>;
    case 'tool':
      return (
        <details class="item tool" data-status={item.status}>
          <summary>
            <span class="tool-name">{item.name}</span>
            <span class="tool-target">{summarize(item.input)}</span>
          </summary>
          {item.output !== undefined && <pre class="tool-output">{item.output}</pre>}
        </details>
      );
    case 'turn-end':
      return item.ok ? null : (
        <div class={item.interrupted ? 'item interrupted' : 'item error'}>{item.reason}</div>
      );
  }
}

/** ツールの入力から、対象が分かる 1 行を作る */
function summarize(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'pattern', 'path', 'url', 'skill']) {
    const value = input[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  const json = JSON.stringify(input);
  return json.length > 80 ? json.slice(0, 80) + '…' : json;
}
