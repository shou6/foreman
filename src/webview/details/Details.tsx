import type { DetailsState, DetailsTurn, FromDetails } from '../detailsProtocol';

interface DetailsProps {
  state: DetailsState | undefined;
  post: (message: FromDetails) => void;
}

/** 右サイドバー。今見ているタスクの変更（ターンごと）とチェックポイント */
export function Details({ state, post }: DetailsProps) {
  if (state === undefined) {
    return null;
  }
  const { task, strings } = state;
  if (task === undefined) {
    return <div class="details empty">{strings.noTask}</div>;
  }
  const busy = task.turnOpen;
  return (
    <div class="details">
      <header class="details-head">
        <button class="title link" onClick={() => post({ type: 'open' })}>
          {task.title}
        </button>
        <span class="status" data-status={task.status}>
          {strings.statusLabels[task.status]}
        </span>
      </header>
      {[...task.turns].reverse().map((turn) => (
        <TurnView key={turn.index} turn={turn} busy={busy} strings={strings} post={post} />
      ))}
    </div>
  );
}

interface TurnProps {
  turn: DetailsTurn;
  busy: boolean;
  strings: DetailsState['strings'];
  post: (message: FromDetails) => void;
}

function TurnView({ turn, busy, strings, post }: TurnProps) {
  return (
    <section class="turn">
      <div class="turn-head">
        <span class="turn-label">{strings.turn.replace('{0}', String(turn.index + 1))}</span>
        <span class="turn-prompt" title={turn.prompt}>
          {turn.prompt}
        </span>
      </div>
      {turn.changes.length === 0 ? (
        <div class="no-changes">{strings.noChanges}</div>
      ) : (
        <ul class="changes">
          {turn.changes.map((change) => (
            <li key={change.path} class="change" data-path={change.path} data-kind={change.kind}>
              <span class="kind">{change.kind.charAt(0).toUpperCase()}</span>
              <span class="path" title={change.path}>
                {change.path}
              </span>
              <span class="counts">
                {change.added !== undefined && <span class="added">+{change.added}</span>}
                {change.removed !== undefined && <span class="removed">-{change.removed}</span>}
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
      )}
      {turn.ok === true && (
        <div class="checkpoint">
          <button
            class="link rewind"
            disabled={busy}
            onClick={() => post({ type: 'rewind', turn: turn.index })}
          >
            {strings.rewindHere}
          </button>
          <button
            class="link fork"
            disabled={busy}
            onClick={() => post({ type: 'fork', turn: turn.index })}
          >
            {strings.forkHere}
          </button>
        </div>
      )}
    </section>
  );
}
