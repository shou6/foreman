import { useState } from 'preact/hooks';
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
              {state.strings.columns[column.key]}
              <span class="count">{column.cards.length}</span>
            </h2>
            <div class="cards">
              {column.cards.length === 0 && <div class="empty">{state.strings.empty}</div>}
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
  return (
    <article
      class="card"
      data-task={card.id}
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
        {card.badge !== undefined && (
          <span class={`badge ${card.badge}`}>{strings.badges[card.badge]}</span>
        )}
      </div>
      {card.prompt !== undefined && card.prompt !== card.title && (
        <p class="card-prompt">{card.prompt}</p>
      )}
      <div class="card-meta">
        {card.model !== undefined && <span class="chip">{card.model}</span>}
        {card.branch !== undefined && <span class="chip">{card.branch}</span>}
        {card.changes > 0 && (
          <span class="chip changes">
            {card.changes} {strings.files}
          </span>
        )}
      </div>
      <div class="card-actions">
        {column === 'draft' && (
          <>
            <button class="action start" onClick={(e) => act(e, { type: 'start', id: card.id })}>
              {strings.start}
            </button>
            <button class="action edit" onClick={(e) => act(e, { type: 'edit', id: card.id })}>
              {strings.edit}
            </button>
          </>
        )}
        {(card.status === 'running' || card.status === 'waiting') && (
          <button class="action stop" onClick={(e) => act(e, { type: 'stop', id: card.id })}>
            {strings.stop}
          </button>
        )}
        {column === 'review' && (
          <button class="action approve" onClick={(e) => act(e, { type: 'approve', id: card.id })}>
            {strings.approve}
          </button>
        )}
        {(column === 'review' || column === 'done' || card.badge !== undefined) && (
          <button class="action fork" onClick={(e) => act(e, { type: 'fork', id: card.id })}>
            {strings.fork}
          </button>
        )}
        <button class="action delete" onClick={(e) => act(e, { type: 'delete', id: card.id })}>
          {strings.delete}
        </button>
      </div>
    </article>
  );
}
