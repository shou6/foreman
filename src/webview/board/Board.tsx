import { useState } from 'preact/hooks';
import { shortModel } from '../../domain/labels';
import { primaryActionOf } from '../../domain/status';
import { Icon } from '../icons';
import type {
  BoardCard,
  BoardColumn,
  BoardColumnKey,
  BoardState,
  FromBoard,
} from '../boardProtocol';

interface BoardProps {
  state: BoardState | undefined;
  post: (message: FromBoard) => void;
}

/** 列の見出しのアイコン */
const COLUMN_ICONS: Record<BoardColumnKey, string> = {
  draft: 'circle-large-outline',
  running: 'sync~spin',
  waiting: 'bell',
  review: 'git-compare',
  done: 'check',
};

/** あなたの番の列で、理由のバッジを出す状態 */
const REASONS = ['approval', 'question', 'replied', 'failed', 'interrupted'] as const;
type Reason = (typeof REASONS)[number];

function reasonOf(card: BoardCard): Reason | undefined {
  return REASONS.find((r) => r === card.kind);
}

/** ドラッグ中のカード。列と ID */
interface Dragging {
  id: string;
  from: BoardColumnKey;
}

/** タスクボード（FR-TASK-11）。列に振り分けたカードを並べ、ドラッグで並べ替えと状態の変更を行う */
export function Board({ state, post }: BoardProps) {
  const [dragging, setDragging] = useState<Dragging | undefined>(undefined);
  const [over, setOver] = useState<BoardColumnKey | undefined>(undefined);
  if (state === undefined) {
    return null;
  }
  const dropOn = (column: BoardColumn, beforeId?: string): void => {
    setOver(undefined);
    if (dragging === undefined) {
      return;
    }
    setDragging(undefined);
    if (dragging.from !== column.key) {
      post({ type: 'move', id: dragging.id, to: column.key });
      return;
    }
    const ids = column.cards.map((c) => c.id).filter((id) => id !== dragging.id);
    const at = beforeId === undefined ? ids.length : ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, dragging.id);
    post({ type: 'reorder', column: column.key, ids });
  };
  return (
    <div class="board">
      <header class="board-head">
        <button class="primary" onClick={() => post({ type: 'newDraft' })}>
          {state.strings.newDraft}
        </button>
      </header>
      <div class="columns">
        {state.columns.map((column) => (
          <section
            key={column.key}
            class="column"
            data-column={column.key}
            data-over={over === column.key ? 'true' : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(column.key);
            }}
            onDragLeave={() => setOver(undefined)}
            onDrop={(e) => {
              e.preventDefault();
              dropOn(column);
            }}
          >
            <h2 class="column-title">
              <Icon name={COLUMN_ICONS[column.key]} extra="column-icon" data-column={column.key} />
              {state.strings.columns[column.key]}
              <span class="count">{column.cards.length}</span>
            </h2>
            <div class="cards">
              {column.cards.length === 0 && (
                <div class="empty">
                  {column.key === 'done' ? state.strings.emptyDone : state.strings.empty}
                </div>
              )}
              {column.cards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  column={column.key}
                  strings={state.strings}
                  post={post}
                  onDragStart={() => setDragging({ id: card.id, from: column.key })}
                  onDropBefore={() => dropOn(column, card.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  card: BoardCard;
  column: BoardColumnKey;
  strings: BoardState['strings'];
  post: (message: FromBoard) => void;
  onDragStart: () => void;
  onDropBefore: () => void;
}

function Card({ card, column, strings, post, onDragStart, onDropBefore }: CardProps) {
  const act = (e: Event, message: FromBoard): void => {
    e.stopPropagation();
    post(message);
  };
  const reason = reasonOf(card);
  const action = primaryActionOf(card.kind);
  // 切り出す・編集・削除などは右クリックのメニュー（左サイドバーと同じコマンド）
  const context = JSON.stringify({
    webviewSection: 'task',
    taskId: card.id,
    foremanStatus: card.status,
    foremanOpen: card.turnOpen,
    foremanWorktree: card.branch !== undefined,
    foremanMergeable: false,
    foremanUnapprovable: card.unapprovable,
    preventDefaultContextMenuItems: true,
  });
  return (
    <article
      class="card"
      data-task={card.id}
      data-column={column}
      data-attention={reason !== undefined ? 'true' : undefined}
      data-live={card.turnOpen ? 'true' : undefined}
      data-vscode-context={context}
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('text/plain', card.id);
        onDragStart();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropBefore();
      }}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => post({ type: 'open', id: card.id })}
    >
      <div class="card-head">
        <span class="card-title">{card.title}</span>
        {reason !== undefined && <span class={`badge ${reason}`}>{strings.badges[reason]}</span>}
      </div>
      {card.prompt !== undefined && card.prompt !== card.title && (
        <p class="card-prompt">{card.prompt}</p>
      )}
      <div class="card-meta">
        {card.model !== undefined && <span>{shortModel(card.model)}</span>}
        {card.branch !== undefined && <span>{card.branch}</span>}
        {card.elapsedMinutes !== undefined && (
          <span>{strings.minutes.replace('{0}', String(card.elapsedMinutes))}</span>
        )}
        {card.changes > 0 && <span>{strings.files.replace('{0}', String(card.changes))}</span>}
        {(card.added !== undefined || card.removed !== undefined) && (
          <span class="counts">
            <span class="added">+{card.added ?? 0}</span>{' '}
            <span class="removed">−{card.removed ?? 0}</span>
          </span>
        )}
      </div>
      {action !== undefined && (
        <div class="card-actions">
          {action === 'start' && (
            <button class="action start" onClick={(e) => act(e, { type: 'start', id: card.id })}>
              {strings.start}
            </button>
          )}
          {action === 'stop' && (
            <button class="action stop" onClick={(e) => act(e, { type: 'stop', id: card.id })}>
              {strings.stop}
            </button>
          )}
          {action === 'open' && (
            <button class="action open" onClick={(e) => act(e, { type: 'open', id: card.id })}>
              {strings.open}
            </button>
          )}
          {action === 'markDone' && (
            <button
              class="action markDone"
              onClick={(e) => act(e, { type: 'approve', id: card.id })}
            >
              {strings.markDone}
            </button>
          )}
          {action === 'approve' && (
            <button
              class="action approve"
              onClick={(e) => act(e, { type: 'approve', id: card.id })}
            >
              {strings.approveAndDone}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
