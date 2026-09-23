import { useState } from 'preact/hooks';
import { answersToInput, questionsOf, type Question } from '../domain/question';
import type { TranscriptItem } from '../domain/transcript';
import { renderMarkdown } from './markdown';
import { numberLines } from '../domain/diff';
import {
  diffKey,
  type DiffLine,
  type FileChange,
  type PanelState,
  type PanelStrings,
  type PendingRequest,
  type ToExtension,
} from './protocol';

export interface AppProps {
  state: PanelState | undefined;
  post: (message: ToExtension) => void;
}

type ToolItem = TranscriptItem & { kind: 'tool' };

/** 連続するツールの呼び出しを 1 つにまとめた、描画用の項目 */
type Block = { kind: 'tools'; turn: number; tools: ToolItem[] } | Exclude<TranscriptItem, ToolItem>;

/** 連続するツールの呼び出しをまとめる（ラフの「Read … · Read … · Grep …」の 1 行） */
function groupTools(items: readonly TranscriptItem[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    const last = blocks[blocks.length - 1];
    if (item.kind === 'tool') {
      if (last?.kind === 'tools' && last.turn === item.turn) {
        last.tools.push(item);
      } else {
        blocks.push({ kind: 'tools', turn: item.turn, tools: [item] });
      }
    } else {
      blocks.push(item);
    }
  }
  return blocks;
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
    post({ type: 'send', prompt, attachments: state.attachments });
    setDraft('');
  };
  const modelOptions =
    state.model !== undefined && !state.models.includes(state.model)
      ? [state.model, ...state.models]
      : state.models;
  return (
    <div
      class="panel"
      style={`--foreman-max-width: ${state.maxWidthEm > 0 ? `${state.maxWidthEm}em` : 'none'}`}
    >
      <header class="head">
        <h1 class="title">{state.title}</h1>
        <span class="status" data-status={state.status}>
          {state.strings.statusLabels[state.status]}
        </span>
        {state.activeModel !== undefined && (
          <span class="chip" title={state.strings.model}>
            {state.activeModel}
          </span>
        )}
      </header>
      <main class="transcript">
        {groupTools(state.items).map((block, i) => (
          <>
            <BlockView key={i} block={block} />
            {block.kind === 'turn-end' && (state.changes[block.turn]?.length ?? 0) > 0 && (
              <DiffCard
                key={`changes-${block.turn}`}
                turn={block.turn}
                changes={state.changes[block.turn] ?? []}
                diffs={state.diffs}
                strings={state.strings}
                post={post}
              />
            )}
          </>
        ))}
        {state.pending !== undefined && (
          <Approval
            key={state.pending.id}
            pending={state.pending}
            strings={state.strings}
            post={post}
          />
        )}
        {state.status === 'running' && <div class="item running">{state.strings.running}</div>}
      </main>
      <footer class="composer">
        {state.attachments.length > 0 && (
          <div class="attachments">
            <span class="attachments-label">{state.strings.attachments}</span>
            {state.attachments.map((path) => (
              <span class="attachment" key={path} title={path}>
                {basename(path)}
                <button
                  class="link"
                  onClick={() => post({ type: 'removeAttachment', path })}
                  title={state.strings.remove}
                >
                  ×<span class="sr-only">{state.strings.remove}</span>
                </button>
              </span>
            ))}
          </div>
        )}
        {state.pending !== undefined ? (
          <div class="waiting-note">{state.strings.waiting}</div>
        ) : (
          <textarea
            class="prompt-input"
            rows={3}
            value={draft}
            disabled={busy}
            placeholder={state.strings.dropHint}
            onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        )}
        <div class="composer-row">
          <label class="model-select">
            <span class="sr-only">{state.strings.model}</span>
            <select
              value={state.model ?? ''}
              onChange={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                post({ type: 'setModel', model: value === '' ? undefined : value });
              }}
            >
              <option value="" selected={state.model === undefined}>
                {state.strings.defaultModel}
              </option>
              {modelOptions.map((m) => (
                <option key={m} value={m} selected={m === state.model}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <span class="composer-spacer" />
          {busy ? (
            <button class="action stop" onClick={() => post({ type: 'interrupt' })}>
              {state.strings.stop}
            </button>
          ) : (
            <button class="action send" onClick={submit}>
              {state.strings.send}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? '' : path.slice(0, i + 1);
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'prompt':
      return <div class="item prompt">{block.text}</div>;
    case 'text':
      return (
        <div
          class="item text markdown"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }}
        />
      );
    case 'tools':
      return (
        <div class="tool-group item">
          {block.tools.map((tool) => (
            <details class="tool" data-status={tool.status} key={tool.id}>
              <summary>
                <span class="tool-name">{tool.name}</span>
                <span class="tool-target">{summarize(tool.input)}</span>
              </summary>
              {tool.output !== undefined && <pre class="tool-output">{tool.output}</pre>}
            </details>
          ))}
        </div>
      );
    case 'turn-end':
      return block.ok ? null : (
        <div class={block.interrupted ? 'item interrupted' : 'item error'}>{block.reason}</div>
      );
  }
}

interface DiffCardProps {
  turn: number;
  changes: FileChange[];
  diffs: Record<string, DiffLine[]>;
  strings: PanelStrings;
  post: (message: ToExtension) => void;
}

/** ターンの差分カード（FR-DIFF-1〜7）。ファイルを開くとインラインの差分を拡張機能に求める */
function DiffCard({ turn, changes, diffs, strings, post }: DiffCardProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const added = changes.reduce((n, c) => n + (c.added ?? 0), 0);
  const removed = changes.reduce((n, c) => n + (c.removed ?? 0), 0);
  return (
    <section class="diff-card">
      <div class="diff-card-head">
        <span class="diff-card-title">{strings.changes}</span>
        <span class="diff-card-summary">
          {changes.length} {strings.files}
          <span class="added"> +{added}</span>
          <span class="removed"> -{removed}</span>
        </span>
      </div>
      {changes.map((change) => {
        const key = diffKey(turn, change.path);
        const lines = diffs[key];
        const canRevert =
          !change.reverted && (change.kind === 'created' || change.before !== undefined);
        return (
          <div class="diff-file" data-kind={change.kind} key={change.path}>
            <div class="diff-file-row">
              <span class="diff-kind" aria-hidden="true">
                {change.kind === 'created' ? 'A' : change.kind === 'deleted' ? 'D' : 'M'}
              </span>
              <button
                class="diff-file-name"
                onClick={() => {
                  const next = !(open[key] ?? lines !== undefined);
                  setOpen({ ...open, [key]: next });
                  if (next && lines === undefined) {
                    post({ type: 'showDiff', turn, path: change.path });
                  }
                }}
              >
                <span class="file-base">{basename(change.path)}</span>
                {dirname(change.path) !== '' && (
                  <span class="file-dir">{dirname(change.path)}</span>
                )}
              </button>
              <span class="diff-file-actions">
                <span class="diff-counts">
                  {change.added !== undefined && <span class="added">+{change.added}</span>}
                  {change.removed !== undefined && <span class="removed">-{change.removed}</span>}
                  {change.before === undefined && change.kind !== 'created' && (
                    <span class="unknown">{strings.unknownBefore}</span>
                  )}
                </span>
                <button
                  class="ghost"
                  onClick={() => post({ type: 'openDiff', turn, path: change.path })}
                >
                  {strings.openDiff}
                </button>
                {change.reverted ? (
                  <span class="reverted">{strings.reverted}</span>
                ) : (
                  canRevert && (
                    <button
                      class="ghost"
                      onClick={() => post({ type: 'revert', turn, path: change.path })}
                    >
                      {strings.revert}
                    </button>
                  )
                )}
              </span>
            </div>
            {lines !== undefined && (open[key] ?? true) && (
              <pre class="diff-lines">
                {numberLines(lines).map((line, i) => (
                  <div class="diff-line" data-kind={line.kind} key={i}>
                    <span class="diff-no" data-old={line.oldNo} data-new={line.newNo}>
                      <span>{line.oldNo ?? ''}</span>
                      <span>{line.newNo ?? ''}</span>
                    </span>
                    <span class="diff-sign">
                      {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
                    </span>
                    {line.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        );
      })}
    </section>
  );
}

interface ApprovalProps {
  pending: PendingRequest;
  strings: PanelStrings;
  post: (message: ToExtension) => void;
}

/** 承認の要求。Claude からの質問なら選択肢のカード、それ以外はツールの承認カード */
function Approval({ pending, strings, post }: ApprovalProps) {
  const questions = questionsOf(pending);
  return questions !== undefined ? (
    <QuestionCard pending={pending} questions={questions} strings={strings} post={post} />
  ) : (
    <ToolCard pending={pending} strings={strings} post={post} />
  );
}

function ToolCard({ pending, strings, post }: ApprovalProps) {
  const [reason, setReason] = useState('');
  const decide = (decision: ToExtension & { type: 'decision' }): void => post(decision);
  return (
    <section class="approval">
      <div class="approval-head">
        <span class="tool-name">{pending.toolName}</span>
        <span class="tool-target">{summarize(pending.input)}</span>
      </div>
      <details class="approval-input">
        <summary>input</summary>
        <pre>{JSON.stringify(pending.input, null, 2)}</pre>
      </details>
      <textarea
        class="deny-reason"
        rows={2}
        placeholder={strings.denyReason}
        value={reason}
        onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)}
      />
      <div class="approval-actions">
        <button
          class="action allow"
          onClick={() =>
            decide({ type: 'decision', requestId: pending.id, decision: { behavior: 'allow' } })
          }
        >
          {strings.allow}
        </button>
        {pending.suggestions.length > 0 && (
          <button
            class="action allow-always"
            onClick={() =>
              decide({
                type: 'decision',
                requestId: pending.id,
                decision: { behavior: 'allow-always', permissions: pending.suggestions },
              })
            }
          >
            {strings.allowAlways}
          </button>
        )}
        <button
          class="action deny"
          onClick={() =>
            decide({
              type: 'decision',
              requestId: pending.id,
              decision: { behavior: 'deny', message: reason.trim() },
            })
          }
        >
          {strings.deny}
        </button>
      </div>
    </section>
  );
}

function QuestionCard({
  pending,
  questions,
  strings,
  post,
}: ApprovalProps & { questions: Question[] }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const toggle = (q: Question, label: string): void => {
    setSelected((current) => {
      const now = current[q.question] ?? [];
      if (!q.multiSelect) {
        return { ...current, [q.question]: [label] };
      }
      return {
        ...current,
        [q.question]: now.includes(label) ? now.filter((l) => l !== label) : [...now, label],
      };
    });
  };
  const complete = questions.every((q) => (selected[q.question]?.length ?? 0) > 0);
  return (
    <section class="question">
      {questions.map((q) => (
        <fieldset key={q.question} class="question-group">
          <legend>
            {q.header !== '' && <span class="question-header">{q.header}</span>}
            {q.question}
          </legend>
          {q.options.map((option) => (
            <label key={option.label} class="question-option">
              <input
                type={q.multiSelect ? 'checkbox' : 'radio'}
                name={q.question}
                checked={(selected[q.question] ?? []).includes(option.label)}
                onChange={() => toggle(q, option.label)}
              />
              <span class="option-label">{option.label}</span>
              {option.description !== '' && (
                <span class="option-description">{option.description}</span>
              )}
            </label>
          ))}
        </fieldset>
      ))}
      <div class="approval-actions">
        <button
          class="action allow"
          disabled={!complete}
          onClick={() =>
            post({
              type: 'decision',
              requestId: pending.id,
              decision: {
                behavior: 'allow',
                updatedInput: answersToInput(
                  pending.input,
                  questions.map((q) => ({
                    question: q.question,
                    selected: selected[q.question] ?? [],
                  }))
                ),
              },
            })
          }
        >
          {strings.answer}
        </button>
      </div>
    </section>
  );
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
