import { useState } from 'preact/hooks';
import { attachmentKey, promptWithAttachments } from '../domain/attachments';
import { applyPreset, matchPresets } from '../domain/presets';
import { formatTokens, type ContextUsage } from '../domain/usage';
import { answersToInput, questionsOf, type Question } from '../domain/question';
import { describeSuggestions } from '../domain/suggestions';
import type { TranscriptItem } from '../domain/transcript';
import { renderMarkdown } from './markdown';
import { hunksOf } from '../domain/diff';
import {
  diffKey,
  type Attachment,
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
  /** 前回の入力の途中（画面を隠したり閉じたりしても残す） */
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
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
export function App({ state, post, initialDraft, onDraftChange }: AppProps) {
  const [draft, setDraftState] = useState(initialDraft ?? '');
  const setDraft = (value: string): void => {
    setDraftState(value);
    onDraftChange?.(value);
  };
  if (state === undefined) {
    return null;
  }
  // 動いている間と、承認・質問に答えていない間は次の指示を送れない
  const busy = state.turnOpen || state.pending !== undefined;
  // 先頭の /名前 はプリセットの本文に置き換えてから送る
  const composed = applyPreset(draft.trim(), state.presets).prompt;
  const submit = (): void => {
    if (composed.trim() === '') {
      return;
    }
    post({ type: 'send', prompt: composed, attachments: state.attachments });
    setDraft('');
  };
  const candidates = matchPresets(draft, state.presets);
  const presetNames = state.presets.map((p) => '/' + p.name).join(' ');
  const lastTurn = state.items.reduce((max, item) => Math.max(max, item.turn), -1);
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
        <button class="title" title={state.strings.rename} onClick={() => post({ type: 'rename' })}>
          {state.title}
        </button>
        <span class="status" data-status={state.status}>
          {state.strings.statusLabels[state.status]}
        </span>
        {state.activeModel !== undefined && (
          <span class="chip" title={state.strings.model}>
            {state.activeModel}
          </span>
        )}
        {state.worktree !== undefined && (
          <span class="chip" title={state.strings.worktree}>
            {state.worktree.branch}
          </span>
        )}
        {state.usage !== undefined && (
          <Meter usage={state.usage} label={state.strings.contextUsage} />
        )}
        <span class="head-spacer" />
        <button class="ghost export" onClick={() => post({ type: 'export' })}>
          {state.strings.export}
        </button>
        {state.status === 'waiting' && !state.turnOpen && state.pending === undefined && (
          <button class="ghost approve" onClick={() => post({ type: 'approve' })}>
            {state.strings.markDone}
          </button>
        )}
        {state.worktree !== undefined && (
          <>
            {state.mergeable && (
              <button
                class="ghost merge"
                disabled={busy || state.finishing !== undefined}
                onClick={() => post({ type: 'merge' })}
              >
                {state.finishing === 'merge'
                  ? state.strings.merging
                  : state.strings.merge.replace('{0}', state.worktree.base)}
              </button>
            )}
            <button
              class="ghost discard"
              disabled={busy || state.finishing !== undefined}
              onClick={() => post({ type: 'discard' })}
            >
              {state.finishing === 'discard' ? state.strings.discarding : state.strings.discard}
            </button>
          </>
        )}
      </header>
      <main class="transcript">
        {groupTools(state.items).map((block, i) => (
          <>
            <BlockView
              key={i}
              block={block}
              expanded={state.toolCallsExpanded}
              strings={state.strings}
            />
            {block.kind === 'turn-end' && block.ok && (
              <div class="checkpoint" key={`checkpoint-${block.turn}`}>
                <span class="checkpoint-turn">
                  {state.strings.turn.replace('{0}', String(block.turn + 1))}
                </span>
                {state.tokens?.[block.turn] !== undefined && (
                  <span class="turn-tokens" title="input / output tokens">
                    ↑{formatTokens(state.tokens[block.turn]?.input ?? 0)} ↓
                    {formatTokens(state.tokens[block.turn]?.output ?? 0)}
                  </span>
                )}
                <button
                  class="link rewind"
                  disabled={busy}
                  onClick={() => post({ type: 'rewind', turn: block.turn })}
                >
                  {state.strings.rewindHere}
                </button>
                <button
                  class="link fork"
                  disabled={busy}
                  onClick={() => post({ type: 'fork', turn: block.turn })}
                >
                  {state.strings.forkHere}
                </button>
              </div>
            )}
            {block.kind === 'turn-end' && (state.changes[block.turn]?.length ?? 0) > 0 && (
              <DiffCard
                key={`changes-${block.turn}`}
                turn={block.turn}
                changes={state.changes[block.turn] ?? []}
                diffs={state.diffs}
                strings={state.strings}
                approvable={state.status === 'review' && block.turn === lastTurn}
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
        {state.turnOpen && state.pending === undefined && (
          <div class="item running">{state.strings.running}</div>
        )}
      </main>
      <footer class="composer">
        <div class="attachments">
          <span class="pass-label">{state.strings.pass}</span>
          {state.attachments.map((a) => {
            const key = attachmentKey(a);
            return (
              <span class="attachment" key={key} title={attachmentTitle(a)}>
                {attachmentChip(a, state.strings)}
                <button
                  class="link"
                  onClick={() => post({ type: 'removeAttachment', key })}
                  title={state.strings.remove}
                >
                  ×<span class="sr-only">{state.strings.remove}</span>
                </button>
              </span>
            );
          })}
          <button class="pass selection" onClick={() => post({ type: 'attachSelection' })}>
            {state.strings.selection}
          </button>
          <button class="pass diagnostics" onClick={() => post({ type: 'attachDiagnostics' })}>
            {state.strings.diagnostics}
          </button>
          <button class="pass git-diff" onClick={() => post({ type: 'attachGitDiff' })}>
            + {state.strings.gitDiff}
          </button>
          <button class="pass pick-files" onClick={() => post({ type: 'pickFiles' })}>
            {state.strings.addFile}
          </button>
        </div>
        <ContextPanel
          prompt={composed}
          attachments={state.attachments}
          context={state.context}
          model={state.activeModel ?? state.model}
          strings={state.strings}
        />
        {candidates.length > 0 && (
          <ul class="preset-list">
            {candidates.map((p) => (
              <li key={p.name}>
                <button class="link preset" onClick={() => setDraft('/' + p.name + ' ')}>
                  /{p.name}
                </button>
                <span class="preset-prompt">{p.prompt.split('\n')[0]}</span>
              </li>
            ))}
          </ul>
        )}
        {state.pending !== undefined ? (
          <div class="waiting-note">{state.strings.waiting}</div>
        ) : (
          <textarea
            class="prompt-input"
            rows={3}
            value={draft}
            disabled={busy}
            placeholder={
              presetNames === ''
                ? state.strings.dropHint
                : state.strings.presetsHint.replace('{0}', presetNames) +
                  ' ' +
                  state.strings.dropHint
            }
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

interface ContextPanelProps {
  prompt: string;
  attachments: Attachment[];
  context: PanelState['context'];
  model: string | undefined;
  strings: PanelStrings;
}

/** Context パネル（FR-VIEW-9）。次に Claude へ送る文と、セッションの条件をそのまま見せる */
function ContextPanel({ prompt, attachments, context, model, strings }: ContextPanelProps) {
  const preview =
    prompt.trim() === '' && attachments.length === 0
      ? undefined
      : promptWithAttachments(prompt, attachments);
  return (
    <details class="context-panel">
      <summary class="context-summary">{strings.contextPanel}</summary>
      {preview === undefined ? (
        <div class="context-empty">{strings.contextEmpty}</div>
      ) : (
        <pre class="context-preview">{preview}</pre>
      )}
      <dl class="context-facts">
        <dt>{strings.directory}</dt>
        <dd>{context.cwd}</dd>
        {model !== undefined && (
          <>
            <dt>{strings.model}</dt>
            <dd>{model}</dd>
          </>
        )}
        <dt>{strings.permissionMode}</dt>
        <dd>{context.permissionMode}</dd>
        {context.alwaysAllowed.length > 0 && (
          <>
            <dt>{strings.alwaysAllowedList}</dt>
            <dd>{context.alwaysAllowed.join(', ')}</dd>
          </>
        )}
      </dl>
    </details>
  );
}

/** コンテキストのメーター（FR-VIEW-8）。窓の大きさが分からなければ使用量だけ */
function Meter({ usage, label }: { usage: ContextUsage; label: string }) {
  const percent = usage.ratio === undefined ? undefined : Math.round(usage.ratio * 100);
  const text =
    usage.window === undefined
      ? formatTokens(usage.used)
      : `${formatTokens(usage.used)} / ${formatTokens(usage.window)}`;
  return (
    <span
      class="meter"
      title={percent === undefined ? `${label}: ${text}` : `${label}: ${text} (${percent}%)`}
      data-level={
        percent === undefined ? undefined : percent >= 90 ? 'high' : percent >= 70 ? 'mid' : 'low'
      }
    >
      <span class="meter-bar">
        <span class="meter-fill" style={`width: ${percent ?? 0}%`} />
      </span>
      <span class="meter-text">{text}</span>
    </span>
  );
}

/** チップの文字。ファイルは名前だけ、選択範囲は path:行、診断と git diff は件数 */
function attachmentChip(a: Attachment, strings: PanelStrings): string {
  switch (a.kind) {
    case 'file':
      return basename(a.path);
    case 'selection':
      return `${a.path}:${a.startLine}-${a.endLine}`;
    case 'diagnostics':
      return `${strings.diagnostics} ${a.count}`;
    case 'gitDiff':
      return `${strings.gitDiff} ${a.files}`;
  }
}

function attachmentTitle(a: Attachment): string {
  return a.kind === 'file' ? a.path : a.kind === 'selection' ? a.text : a.text.slice(0, 500);
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? '' : path.slice(0, i + 1);
}

function BlockView({
  block,
  expanded,
  strings,
}: {
  block: Block;
  expanded: boolean;
  strings: PanelStrings;
}) {
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
    case 'tools': {
      const ok = block.tools.filter((t) => t.status === 'ok').length;
      const failed = block.tools.filter((t) => t.status === 'error').length;
      const running = block.tools.some((t) => t.status === 'running');
      const names = [...new Set(block.tools.map((t) => t.name))].join(', ');
      // 設定どおりに開閉する。実行中でも勝手に開かない（開閉の繰り返しが目障りなため）
      return (
        <details class="tool-group item" open={expanded}>
          <summary class="group-summary">
            <span class="tool-count">
              {strings.toolCalls.replace('{0}', String(block.tools.length))}
            </span>
            <span class="tool-marks">
              {ok > 0 && <span class="ok">✓{ok}</span>}
              {failed > 0 && <span class="failed">✗{failed}</span>}
              {running && <span class="running">…</span>}
            </span>
            <span class="tool-names">{names}</span>
          </summary>
          {block.tools.map((tool) => (
            <details class="tool" data-status={tool.status} key={tool.id}>
              <summary>
                <span class="tool-name">{tool.name}</span>
                <span class="tool-target">{summarize(tool.input)}</span>
              </summary>
              {tool.output !== undefined && <pre class="tool-output">{tool.output}</pre>}
            </details>
          ))}
        </details>
      );
    }
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
  /** レビュー待ちの最後のターンなら「承認」を出す */
  approvable: boolean;
  post: (message: ToExtension) => void;
}

/** ターンの差分カード（FR-DIFF-1〜7）。ファイルを開くとインラインの差分を拡張機能に求める */
function DiffCard({ turn, changes, diffs, strings, approvable, post }: DiffCardProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const added = changes.reduce((n, c) => n + (c.added ?? 0), 0);
  const removed = changes.reduce((n, c) => n + (c.removed ?? 0), 0);
  const revertible = changes.some((c) => !c.reverted);
  return (
    <section class="diff-card">
      <div class="diff-card-head">
        <span class="diff-card-title">{strings.changes}</span>
        <span class="diff-card-summary">
          {changes.length} {strings.files}
          <span class="added"> +{added}</span>
          <span class="removed"> -{removed}</span>
        </span>
        <span class="head-spacer" />
        <button
          class="revert-all"
          disabled={!revertible}
          onClick={() => post({ type: 'revertAll', turn })}
        >
          {strings.revertAll}
        </button>
        {approvable && (
          <button class="approve primary" onClick={() => post({ type: 'approve' })}>
            {strings.approve}
          </button>
        )}
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
                {hunksOf(lines, 3).flatMap((hunk, h) => [
                  <div class="diff-hunk" key={`h${h}`}>
                    @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                  </div>,
                  ...hunk.lines.map((line, i) => (
                    <div class="diff-line" data-kind={line.kind} key={`${h}-${i}`}>
                      <span class="diff-no" data-old={line.oldNo} data-new={line.newNo}>
                        <span>{line.oldNo ?? ''}</span>
                        <span>{line.newNo ?? ''}</span>
                      </span>
                      <span class="diff-sign">
                        {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
                      </span>
                      {line.text}
                    </div>
                  )),
                ])}
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
      {pending.suggestions.length > 0 && (
        <div class="always-scope">
          {strings.alwaysScope}: {describeSuggestions(pending.suggestions).join(', ')}
        </div>
      )}
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
