import { Icon } from '../icons';
import { dayKindOf, formatDate, sameLocalDay } from '../../domain/time';
import type { DetailsState, DetailsTask, DetailsTurn, FromDetails } from '../detailsProtocol';
import { SessionDock, type DockTab } from './SessionDock';

/** 全ターンの追加・削除の行数の合計。数えられない変更は除く。live なら戻した変更も除く */
function lineTotals(
  turns: readonly DetailsTurn[],
  live = false
): { added?: number; removed?: number } {
  let added: number | undefined;
  let removed: number | undefined;
  for (const turn of turns) {
    for (const change of turn.changes) {
      if (live && change.reverted) {
        continue;
      }
      if (change.added !== undefined) {
        added = (added ?? 0) + change.added;
      }
      if (change.removed !== undefined) {
        removed = (removed ?? 0) + change.removed;
      }
    }
  }
  return { added, removed };
}

interface DetailsProps {
  state: DetailsState | undefined;
  post: (message: FromDetails) => void;
  /** 下の区画で最初に開いておくタブ */
  initialTab?: DockTab;
}

/**
 * 右サイドバー。今見ているタスクの変更（ターンごと）とチェックポイント、仕上げ。
 * 下の区画に、セッションの情報（概要・MCP・常に許可）を出す
 */
export function Details({ state, post, initialTab }: DetailsProps) {
  if (state === undefined) {
    return null;
  }
  const { task, strings } = state;
  if (task === undefined) {
    return <div class="details empty">{strings.noTask}</div>;
  }
  const busy = task.turnOpen;
  const totals = lineTotals(task.turns);
  const anyChanges = task.turns.some((turn) => turn.changes.length > 0);
  return (
    <div class="details-root">
      <div class="details">
        <header class="details-head">
          <button class="title link" onClick={() => post({ type: 'open' })}>
            {task.title}
          </button>
          <span class="status" data-kind={task.kind}>
            {strings.statusLabels[task.kind]}
          </span>
        </header>
        <div class="changes-title">
          <span>{strings.changesTitle}</span>
          {!anyChanges && <span class="none">{strings.none}</span>}
          {(totals.added !== undefined || totals.removed !== undefined) && (
            <span class="counts">
              <span class="added">+{totals.added ?? 0}</span>
              <span class="removed">−{totals.removed ?? 0}</span>
            </span>
          )}
        </div>
        {[...task.turns].reverse().map((turn, i, turns) => (
          <>
            <TurnDay
              key={`day-${turn.index}`}
              turn={turn}
              newer={turns[i - 1]}
              locale={state.locale ?? 'en'}
              strings={strings}
            />
            <TurnView key={turn.index} turn={turn} busy={busy} strings={strings} post={post} />
          </>
        ))}
        {task.worktree !== undefined ? (
          <Finish task={task} worktree={task.worktree} busy={busy} strings={strings} post={post} />
        ) : (
          <section class="finish">
            <div class="finish-actions">
              <button class="finish-button all-diff" onClick={() => post({ type: 'allDiff' })}>
                {strings.allDiff}
              </button>
            </div>
          </section>
        )}
      </div>
      {state.session !== undefined && (
        <SessionDock
          taskId={task.id}
          session={state.session}
          mcp={state.mcp}
          height={state.dockHeight}
          strings={strings}
          post={post}
          initialTab={initialTab}
        />
      )}
    </div>
  );
}

/**
 * ターンの一覧の日付の見出し（新しい順に並べた時の、日付の変わり目）。
 * 今日・昨日はその呼び名、それより前は日付。時刻の無い古い記録には出さない
 */
function TurnDay({
  turn,
  newer,
  locale,
  strings,
}: {
  turn: DetailsTurn;
  newer: DetailsTurn | undefined;
  locale: string;
  strings: DetailsState['strings'];
}) {
  if (turn.startedAt === undefined) {
    return null;
  }
  if (newer?.startedAt !== undefined && sameLocalDay(newer.startedAt, turn.startedAt)) {
    return null;
  }
  const now = new Date();
  const kind = dayKindOf(turn.startedAt, now);
  const label =
    kind === 'today'
      ? strings.today
      : kind === 'yesterday'
        ? strings.yesterday
        : formatDate(turn.startedAt, locale, now);
  return <div class="turn-day">{label}</div>;
}

interface FinishProps {
  task: DetailsTask;
  worktree: NonNullable<DetailsTask['worktree']>;
  busy: boolean;
  strings: DetailsState['strings'];
  post: (message: FromDetails) => void;
}

/** worktree の仕上げ。承認 → 全体の差分 → マージの手順と、区切った下段の破棄 */
function Finish({ task, worktree, busy, strings, post }: FinishProps) {
  // 戻していない変更だけを数える
  const files = new Set<string>();
  let turns = 0;
  for (const turn of task.turns) {
    const live = turn.changes.filter((change) => !change.reverted);
    if (live.length > 0) {
      turns++;
      live.forEach((change) => files.add(change.path));
    }
  }
  const approved = task.status === 'done';
  const totals = lineTotals(task.turns, true);
  return (
    <section class="finish">
      <div class="finish-head">
        <h3 class="finish-title">{strings.finish}</h3>
        <span class="finish-route">
          {worktree.branch} → {worktree.base}
        </span>
      </div>
      {files.size === 0 ? (
        <div class="finish-step">
          <Icon name="circle-large-outline" extra="step-icon" />
          <div>
            <div>{strings.nothingToMerge}</div>
            <div class="finish-note">{strings.nothingToMergeHint}</div>
          </div>
        </div>
      ) : (
        <>
          <div class="finish-step">
            <Icon
              name={approved ? 'pass-filled' : 'circle-large-outline'}
              extra={approved ? 'step-icon done' : 'step-icon'}
            />
            <span class="step-label">
              {approved
                ? strings.stepApproved
                    .replace('{0}', String(turns))
                    .replace('{1}', String(files.size))
                : strings.stepApprove}
            </span>
          </div>
          <div class="finish-step">
            <Icon name="circle-large-outline" extra="step-icon" />
            <span class="step-label">
              {strings.stepReview}{' '}
              <span class="counts">
                <span class="added">+{totals.added ?? 0}</span>{' '}
                <span class="removed">−{totals.removed ?? 0}</span>
              </span>
            </span>
            <button class="finish-button all-diff" onClick={() => post({ type: 'allDiff' })}>
              {strings.allDiff}
            </button>
          </div>
          <div class="finish-step">
            <Icon name="circle-large-outline" extra="step-icon" />
            <span class="step-label">{strings.stepMerge.replace('{0}', worktree.base)}</span>
            <button
              class="finish-button merge primary"
              disabled={busy || !task.mergeable}
              onClick={() => post({ type: 'merge' })}
            >
              {strings.merge.replace('{0}', worktree.base)}
            </button>
          </div>
        </>
      )}
      <div class="finish-footer">
        <span class="step-label">
          {files.size === 0 ? strings.endWithoutChanges : strings.endWithoutMerge}
        </span>
        <button
          class="finish-button discard"
          disabled={busy}
          onClick={() => post({ type: 'discard' })}
        >
          {strings.discardWorktree}
        </button>
      </div>
    </section>
  );
}

interface TurnProps {
  turn: DetailsTurn;
  busy: boolean;
  strings: DetailsState['strings'];
  post: (message: FromDetails) => void;
}

function TurnView({ turn, busy, strings, post }: TurnProps) {
  const checkpoint = turn.ok === true && (
    <span class="checkpoint">
      <button
        class="icon-button rewind"
        title={strings.rewindHere}
        aria-label={strings.rewindHere}
        disabled={busy}
        onClick={() => post({ type: 'rewind', turn: turn.index })}
      >
        <Icon name="discard" />
      </button>
      <button
        class="icon-button fork"
        title={strings.forkHere}
        aria-label={strings.forkHere}
        disabled={busy}
        onClick={() => post({ type: 'fork', turn: turn.index })}
      >
        <Icon name="git-branch" />
      </button>
    </span>
  );
  // 変更の無いターンは 1 行にまとめる
  if (turn.changes.length === 0) {
    return (
      <section class="turn compact">
        <div class="turn-head">
          <span class="turn-label">{strings.turn.replace('{0}', String(turn.index + 1))}</span>
          <span class="turn-prompt" title={turn.prompt}>
            {turn.prompt}
          </span>
          <span class="no-changes">{strings.noChanges}</span>
          {checkpoint}
        </div>
      </section>
    );
  }
  return (
    <section class="turn">
      <div class="turn-head">
        <span class="turn-label">{strings.turn.replace('{0}', String(turn.index + 1))}</span>
        <span class="turn-prompt" title={turn.prompt}>
          {turn.prompt}
        </span>
        {checkpoint}
      </div>
      <ul class="changes">
        {turn.changes.map((change) => (
          <li key={change.path} class="change" data-path={change.path} data-kind={change.kind}>
            <span class="kind">{change.kind.charAt(0).toUpperCase()}</span>
            <span class="path" title={change.path}>
              {change.path}
            </span>
            <span class="counts">
              {change.added !== undefined && <span class="added">+{change.added}</span>}
              {change.removed !== undefined && <span class="removed">−{change.removed}</span>}
            </span>
            <button
              class="link open-diff"
              onClick={() => post({ type: 'openDiff', turn: turn.index, path: change.path })}
            >
              {strings.openDiff}
            </button>
            {change.reverted ? (
              <span class="reverted">{strings.reverted}</span>
            ) : (
              <button
                class="link revert"
                disabled={busy}
                onClick={() => post({ type: 'revert', turn: turn.index, path: change.path })}
              >
                {strings.revert}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
