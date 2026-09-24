import { useEffect, useRef, useState } from 'preact/hooks';
import { attachmentKey, promptWithAttachments } from '../domain/attachments';
import { shortModel } from '../domain/labels';
import { applyPreset, matchPresets } from '../domain/presets';
import { formatTokens, type ContextUsage } from '../domain/usage';
import {
  answersToInput,
  nextTabAfterChoice,
  optionKeyOf,
  questionsOf,
  withOther,
  type Question,
} from '../domain/question';
import { approvalKindOf, pendingKindOf, statusKindOf } from '../domain/status';
import { describeSuggestions } from '../domain/suggestions';
import { splitElapsed } from '../domain/time';
import type { TranscriptItem } from '../domain/transcript';
import { Icon, STATUS_ICONS } from './icons';
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

/** 経過ミリ秒を「12s」「1m 12s」の形にする */
function formatElapsed(ms: number, strings: PanelStrings): string {
  const { minutes, seconds } = splitElapsed(ms);
  return minutes === 0
    ? strings.elapsedSeconds.replace('{0}', String(seconds))
    : strings.elapsedMinutes.replace('{0}', String(minutes)).replace('{1}', String(seconds));
}

/** 実行中は 1 秒ごとに描き直し、経過時間を進める。返り値は今の時刻 */
function useTicking(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return Math.max(now, Date.now());
}

/** タスク画面。状態は拡張機能から届いたものをそのまま描く */
export function App({ state, post, initialDraft, onDraftChange }: AppProps) {
  const [draft, setDraftState] = useState(initialDraft ?? '');
  // 実行中のツールとターンを最初に見た時刻（開始の時刻が分からない時の経過に使う）
  const seen = useRef(new Map<string, number>());
  const now = useTicking(state?.turnOpen === true);
  const setDraft = (value: string): void => {
    setDraftState(value);
    onDraftChange?.(value);
  };
  if (state === undefined) {
    return null;
  }
  // 動いている間と、承認・質問に答えていない間は次の指示を送れない（書いておくことはできる）
  const busy = state.turnOpen || state.pending !== undefined;
  // 先頭の /名前 はプリセットの本文に置き換えてから送る
  const composed = applyPreset(draft.trim(), state.presets).prompt;
  const submit = (): void => {
    if (busy || composed.trim() === '') {
      return;
    }
    post({ type: 'send', prompt: composed, attachments: state.attachments });
    setDraft('');
  };
  const candidates = matchPresets(draft, state.presets);
  const lastTurn = state.items.reduce((max, item) => Math.max(max, item.turn), -1);
  const modelOptions =
    state.model !== undefined && !state.models.includes(state.model)
      ? [state.model, ...state.models]
      : state.models;
  const kind = statusKindOf(
    state.status,
    state.turnOpen,
    state.pending === undefined ? undefined : pendingKindOf(state.pending)
  );
  const elapsedSince = (key: string): string => {
    const start = seen.current.get(key) ?? Date.now();
    seen.current.set(key, start);
    return formatElapsed(now - start, state.strings);
  };
  const turnElapsed = (): string => {
    const started = state.turnStartedAt === undefined ? NaN : Date.parse(state.turnStartedAt);
    return Number.isFinite(started)
      ? formatElapsed(now - started, state.strings)
      : elapsedSince(`turn:${lastTurn}`);
  };
  const markDone = state.status === 'waiting' && !state.turnOpen && state.pending === undefined;
  // 前のターンで動いたモデルが、次に使うモデルと違う時だけ知らせる
  const previousModel =
    state.activeModel !== undefined && state.activeModel !== state.model
      ? state.activeModel
      : undefined;
  return (
    <div
      class="panel"
      style={`--foreman-max-width: ${state.maxWidthEm > 0 ? `${state.maxWidthEm}em` : 'none'}`}
    >
      <header class="head">
        <div class="head-row">
          <button
            class="title"
            title={state.strings.rename}
            onClick={() => post({ type: 'rename' })}
          >
            {state.title}
          </button>
          <span class="status" data-kind={kind}>
            <Icon name={STATUS_ICONS[kind]} />
            {state.strings.statusLabels[kind]}
          </span>
          <span class="head-spacer" />
          {markDone && (
            <button class="head-action approve" onClick={() => post({ type: 'approve' })}>
              {state.strings.markDone}
            </button>
          )}
          {state.worktree !== undefined && state.mergeable && (
            <button
              class="head-action merge"
              disabled={busy || state.finishing !== undefined}
              onClick={() => post({ type: 'merge' })}
            >
              {state.finishing === 'merge'
                ? state.strings.merging
                : state.strings.merge.replace('{0}', state.worktree.base)}
            </button>
          )}
          <button
            class="icon-button more"
            title={state.strings.more}
            aria-label={state.strings.more}
            onClick={() => post({ type: 'more' })}
          >
            <Icon name="ellipsis" />
          </button>
        </div>
        {(state.worktree !== undefined || state.usage !== undefined) && (
          <div class="head-meta">
            {state.worktree !== undefined && (
              <span class="branch" title={state.strings.worktree}>
                <Icon name="git-branch" />
                {`${state.worktree.branch} → ${state.worktree.base}`}
              </span>
            )}
            {state.usage !== undefined && (
              <Meter usage={state.usage} label={state.strings.contextUsage} />
            )}
          </div>
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
              toolElapsed={(id) => elapsedSince(`tool:${id}`)}
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
                <span class="checkpoint-actions">
                  <button
                    class="checkpoint-action rewind"
                    title={state.strings.rewindHere}
                    disabled={busy}
                    onClick={() => post({ type: 'rewind', turn: block.turn })}
                  >
                    <Icon name="discard" />
                    {state.strings.rewind}
                  </button>
                  <button
                    class="checkpoint-action fork"
                    title={state.strings.forkHere}
                    disabled={busy}
                    onClick={() => post({ type: 'fork', turn: block.turn })}
                  >
                    <Icon name="git-branch" />
                    {state.strings.fork}
                  </button>
                </span>
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
          <div class="checkpoint running">
            <span class="checkpoint-turn">
              {state.strings.runningTurn
                .replace('{0}', String(Math.max(lastTurn, 0) + 1))
                .replace('{1}', turnElapsed())}
            </span>
          </div>
        )}
      </main>
      <footer class="composer">
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
        <div class="composer-box">
          {state.attachments.length > 0 && (
            <div class="attachments">
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
            </div>
          )}
          {state.pending !== undefined ? (
            <div class="waiting-note">{state.strings.waiting}</div>
          ) : (
            <textarea
              class="prompt-input"
              rows={2}
              value={draft}
              placeholder={
                state.turnOpen
                  ? state.strings.draftHint
                  : state.presets.length > 0
                    ? state.strings.promptHintPresets
                    : state.strings.promptHint
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
          <div class="drop-hint">{state.strings.dropHint}</div>
          <div class="composer-toolbar">
            <button
              class="tool selection"
              title={state.strings.selection}
              onClick={() => post({ type: 'attachSelection' })}
            >
              <Icon name="selection" />
              {state.strings.selection}
            </button>
            <button
              class="tool diagnostics"
              title={state.strings.diagnostics}
              onClick={() => post({ type: 'attachDiagnostics' })}
            >
              <Icon name="warning" />
              {state.strings.diagnostics}
            </button>
            <button
              class="tool git-diff"
              title={state.strings.gitDiff}
              onClick={() => post({ type: 'attachGitDiff' })}
            >
              <Icon name="git-compare" />
              {state.strings.gitDiff}
            </button>
            <button
              class="tool pick-files"
              title={state.strings.addFile}
              onClick={() => post({ type: 'pickFiles' })}
            >
              <Icon name="file-add" />
              {state.strings.addFile}
            </button>
            <span class="composer-spacer" />
            {previousModel !== undefined && (
              <span class="previous-model">
                {state.strings.previousModel.replace('{0}', shortModel(previousModel))}
              </span>
            )}
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
            {busy ? (
              <button class="action stop" onClick={() => post({ type: 'interrupt' })}>
                <Icon name="debug-stop" />
                {state.strings.stop}
              </button>
            ) : (
              <button class="action send" disabled={composed.trim() === ''} onClick={submit}>
                {state.strings.send}
              </button>
            )}
          </div>
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
  // 閉じていても、ディレクトリ・承認方式・添付数は見えるようにする
  const brief = [
    context.cwd,
    `${strings.permissionMode} ${context.permissionMode}`,
    attachments.length === 0
      ? strings.noAttachments
      : strings.attachmentCount.replace('{0}', String(attachments.length)),
  ].join(' · ');
  return (
    <details class="context-panel">
      <summary class="context-summary">
        <span class="context-label">{strings.contextPanel}</span>
        <span class="context-brief" title={brief}>
          {brief}
        </span>
      </summary>
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
      : `${formatTokens(usage.used)} / ${formatTokens(usage.window)}${percent === undefined ? '' : ` (${percent}%)`}`;
  return (
    <span
      class="meter"
      title={`${label}: ${text}`}
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
  toolElapsed,
}: {
  block: Block;
  expanded: boolean;
  strings: PanelStrings;
  /** 実行中のツールの経過 */
  toolElapsed: (id: string) => string;
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
      const running = block.tools.filter((t) => t.status === 'running');
      // 実行中のツールはグループの外に 1 行で出すので、要約の名前からは外す
      const names = [
        ...new Set(block.tools.filter((t) => t.status !== 'running').map((t) => t.name)),
      ].join(', ');
      // 設定どおりに開閉する。実行中でも勝手に開かない（開閉の繰り返しが目障りなため）
      return (
        <>
          <details class="tool-group item" open={expanded}>
            <summary class="group-summary">
              <span class="tool-count">
                {strings.toolCalls.replace('{0}', String(block.tools.length))}
              </span>
              <span class="tool-marks">
                {ok > 0 && <span class="ok">✓{ok}</span>}
                {failed > 0 && <span class="failed">✗{failed}</span>}
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
          {running.map((tool) => (
            <div class="tool-running" key={`running-${tool.id}`}>
              <Icon name="loading~spin" />
              <span class="tool-name">{tool.name}</span>
              <span class="tool-target">{summarize(tool.input)}</span>
              <span class="tool-elapsed">{toolElapsed(tool.id)}</span>
            </div>
          ))}
        </>
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
  /** レビュー待ちの最後のターンなら「承認して完了」を出す */
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
        <span class="diff-card-title">
          {strings.changesInTurn.replace('{0}', String(turn + 1))}
        </span>
        <span class="diff-card-summary">
          {changes.length} {strings.files}
          <span class="added"> +{added}</span>
          <span class="removed"> −{removed}</span>
        </span>
        <span class="head-spacer" />
        <button
          class="revert-all"
          disabled={!revertible}
          onClick={() => post({ type: 'revertAll', turn })}
        >
          <Icon name="discard" />
          {strings.revertAll}
        </button>
        {approvable && (
          <button class="approve primary" onClick={() => post({ type: 'approve' })}>
            {strings.approveAndDone}
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
                  {change.removed !== undefined && <span class="removed">−{change.removed}</span>}
                </span>
                {change.before === undefined && change.kind !== 'created' && (
                  <span class="unknown">
                    <Icon name="warning" />
                    {strings.unknownBefore}
                  </span>
                )}
                {change.reverted && <span class="reverted">{strings.reverted}</span>}
                <span class="diff-row-actions">
                  <button
                    class="icon-button open-diff"
                    title={strings.openDiff}
                    aria-label={strings.openDiff}
                    onClick={() => post({ type: 'openDiff', turn, path: change.path })}
                  >
                    <Icon name="diff" />
                  </button>
                  {canRevert && (
                    <button
                      class="icon-button revert"
                      title={strings.revert}
                      aria-label={strings.revert}
                      onClick={() => post({ type: 'revert', turn, path: change.path })}
                    >
                      <Icon name="discard" />
                    </button>
                  )}
                </span>
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

/** ツールの承認カード。何をするかを問いの形で先に見せ、理由の欄は拒否する時だけ開く */
function ToolCard({ pending, strings, post }: ApprovalProps) {
  const [reason, setReason] = useState('');
  const [denying, setDenying] = useState(false);
  const decide = (decision: ToExtension & { type: 'decision' }): void => post(decision);
  const title = strings.approvalTitles[approvalKindOf(pending.toolName)].replace(
    '{0}',
    pending.toolName
  );
  const target = summarize(pending.input);
  return (
    <section class="approval">
      <div class="approval-title">
        <Icon name="shield" />
        {title}
      </div>
      {target !== '{}' && <pre class="approval-target">{target}</pre>}
      <details class="approval-input">
        <summary>{strings.inputDetails}</summary>
        <pre>{JSON.stringify(pending.input, null, 2)}</pre>
      </details>
      {denying && (
        <textarea
          class="deny-reason"
          rows={2}
          placeholder={strings.denyReason}
          value={reason}
          onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)}
        />
      )}
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
            <span class="always-scope">{describeSuggestions(pending.suggestions).join(', ')}</span>
          </button>
        )}
        <button
          class="action deny"
          onClick={() => {
            if (!denying) {
              setDenying(true);
              return;
            }
            decide({
              type: 'decision',
              requestId: pending.id,
              decision: { behavior: 'deny', message: reason.trim() },
            });
          }}
        >
          {denying ? strings.denyConfirm : strings.deny}
        </button>
      </div>
    </section>
  );
}

/**
 * Claude からの質問。選択肢は行ごと押せる枠にし、数字キーで選ぶ。
 * 質問が複数ある時は見出しのタブで 1 問ずつ出し、最後の確認のタブで答えをまとめて送る
 */
function QuestionCard({
  pending,
  questions,
  strings,
  post,
}: ApprovalProps & { questions: Question[] }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  // 「その他」を選んだ質問の、書いた文（選んでいなければ undefined）
  const [others, setOthers] = useState<Record<string, string | undefined>>({});
  // 開いているタブ。questions.length は確認のタブ
  const [active, setActive] = useState(0);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.focus();
  }, []);
  const tabbed = questions.length > 1;
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
    if (!q.multiSelect) {
      setOthers((current) => ({ ...current, [q.question]: undefined }));
    }
  };
  const toggleOther = (q: Question): void => {
    const chosen = others[q.question] !== undefined;
    setOthers((current) => ({ ...current, [q.question]: chosen ? undefined : '' }));
    if (!q.multiSelect && !chosen) {
      setSelected((current) => ({ ...current, [q.question]: [] }));
    }
  };
  /** 質問 qi の index 番目（options.length なら「その他」）を選ぶ。単一選択なら次のタブへ進む */
  const choose = (qi: number, index: number): void => {
    const q = questions[qi];
    if (q === undefined) {
      return;
    }
    const option = q.options[index];
    if (option === undefined) {
      toggleOther(q);
    } else {
      toggle(q, option.label);
    }
    if (tabbed) {
      setActive(
        nextTabAfterChoice(
          { multiSelect: q.multiSelect, other: option === undefined },
          qi,
          questions.length
        )
      );
    }
  };
  const answersOf = (q: Question): string[] =>
    withOther(selected[q.question] ?? [], others[q.question]);
  const complete = questions.every((q) => answersOf(q).length > 0);
  const answer = (): void => {
    if (!complete) {
      return;
    }
    post({
      type: 'decision',
      requestId: pending.id,
      decision: {
        behavior: 'allow',
        updatedInput: answersToInput(
          pending.input,
          questions.map((q) => ({ question: q.question, selected: answersOf(q) }))
        ),
      },
    });
  };
  const onSubmitTab = tabbed && active >= questions.length;
  const shown = tabbed ? questions.slice(active, active + 1) : questions;
  const current = questions[active];
  return (
    <section
      class="question"
      tabIndex={0}
      ref={card}
      onKeyDown={(e) => {
        const typing = e.target instanceof HTMLInputElement && e.target.type === 'text';
        if (e.key === 'Enter') {
          e.preventDefault();
          if (tabbed && !onSubmitTab) {
            setActive(active + 1);
          } else {
            answer();
          }
          return;
        }
        if (tabbed && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const step = e.key === 'ArrowLeft' ? -1 : 1;
          setActive(Math.min(Math.max(active + step, 0), questions.length));
          return;
        }
        const index =
          typing || current === undefined ? undefined : optionKeyOf(e.key, current.options.length);
        if (index !== undefined) {
          e.preventDefault();
          choose(active, index);
        }
      }}
    >
      {tabbed && (
        <div class="question-tabs" role="tablist">
          {questions.map((q, i) => (
            <button
              key={q.question}
              class="question-tab"
              role="tab"
              aria-selected={i === active ? 'true' : 'false'}
              data-answered={answersOf(q).length > 0 ? 'true' : undefined}
              onClick={() => setActive(i)}
            >
              {q.header !== '' ? q.header : `${i + 1}`}
            </button>
          ))}
          <button
            class="question-tab submit"
            role="tab"
            aria-selected={onSubmitTab ? 'true' : 'false'}
            onClick={() => setActive(questions.length)}
          >
            {strings.submitTab}
          </button>
        </div>
      )}
      {shown.map((q) => {
        const qi = questions.indexOf(q);
        const chosen = selected[q.question] ?? [];
        const other = others[q.question];
        return (
          <fieldset key={q.question} class="question-group">
            <legend class="question-title">
              <Icon name="question" />
              {q.header !== '' && <span class="question-header">{q.header}</span>}
              <span class="question-text">{q.question}</span>
            </legend>
            {q.options.map((option, i) => (
              <label
                key={option.label}
                class="question-option"
                data-selected={chosen.includes(option.label) ? 'true' : undefined}
              >
                <input
                  class="sr-only"
                  type={q.multiSelect ? 'checkbox' : 'radio'}
                  name={q.question}
                  checked={chosen.includes(option.label)}
                  onChange={() => choose(qi, i)}
                />
                <span class="option-key">{i + 1}</span>
                <span class="option-body">
                  <span class="option-label">{option.label}</span>
                  {option.description !== '' && (
                    <span class="option-description">{option.description}</span>
                  )}
                </span>
              </label>
            ))}
            <label
              class="question-option other"
              data-selected={other !== undefined ? 'true' : undefined}
            >
              <input
                class="sr-only"
                type={q.multiSelect ? 'checkbox' : 'radio'}
                name={q.question}
                checked={other !== undefined}
                onChange={() => choose(qi, q.options.length)}
              />
              <span class="option-key">{q.options.length + 1}</span>
              <span class="option-body">
                <span class="option-label">{strings.other}</span>
                {other !== undefined && (
                  <input
                    class="other-input"
                    type="text"
                    placeholder={strings.otherPlaceholder}
                    value={other}
                    onInput={(e) =>
                      setOthers((now) => ({
                        ...now,
                        [q.question]: (e.target as HTMLInputElement).value,
                      }))
                    }
                  />
                )}
              </span>
            </label>
          </fieldset>
        );
      })}
      {onSubmitTab && (
        <dl class="question-summary">
          {questions.map((q) => {
            const answers = answersOf(q);
            return (
              <>
                <dt key={`q-${q.question}`}>{q.header !== '' ? q.header : q.question}</dt>
                <dd key={`a-${q.question}`} class={answers.length === 0 ? 'unanswered' : undefined}>
                  {answers.length === 0 ? strings.unanswered : answers.join(', ')}
                </dd>
              </>
            );
          })}
        </dl>
      )}
      <div class="approval-actions">
        {tabbed && !onSubmitTab ? (
          <button class="action next" onClick={() => setActive(active + 1)}>
            {strings.next}
          </button>
        ) : (
          <button class="action allow" disabled={!complete} onClick={answer}>
            {strings.answer}
          </button>
        )}
        {current !== undefined && (
          <span class="question-keys">
            {(tabbed ? strings.questionTabKeys : strings.questionKeys).replace(
              '{0}',
              String(current.options.length + 1)
            )}
          </span>
        )}
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
