import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Board } from '../../../webview/board/Board';
import type { BoardCard, BoardState, FromBoard } from '../../../webview/boardProtocol';

const STRINGS = {
  columns: {
    draft: 'Draft',
    running: 'Running',
    waiting: 'Your turn',
    review: 'Review',
    done: 'Done',
  },
  badges: {
    approval: 'Needs approval',
    question: 'Question',
    replied: 'Replied',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
  newDraft: 'New draft',
  start: 'Start',
  stop: 'Stop',
  open: 'Open',
  markDone: 'Mark as done',
  approveAndDone: 'Approve and finish',
  files: '{0} files',
  empty: 'No tasks',
  emptyDone: 'Drag reviewed cards here to finish them',
  minutes: '{0} min',
};

function card(extra: Partial<BoardCard> & Pick<BoardCard, 'id' | 'kind' | 'status'>): BoardCard {
  return { title: extra.id, turnOpen: false, changes: 0, updatedAt: '', ...extra };
}

function state(overrides: Partial<BoardState> = {}): BoardState {
  return {
    columns: [
      {
        key: 'draft',
        cards: [
          card({
            id: 'd1',
            title: 'Draft one',
            status: 'draft',
            kind: 'draft',
            prompt: 'do later',
            model: 'claude-sonnet-5',
          }),
        ],
      },
      {
        key: 'running',
        cards: [
          card({
            id: 'r1',
            title: 'Run one',
            status: 'running',
            kind: 'running',
            turnOpen: true,
            elapsedMinutes: 3,
          }),
        ],
      },
      {
        key: 'waiting',
        cards: [
          card({ id: 'w1', title: 'Wait one', status: 'waiting', kind: 'replied' }),
          card({
            id: 'w2',
            title: 'Wait two',
            status: 'waiting',
            kind: 'approval',
            turnOpen: true,
          }),
          card({ id: 'f1', title: 'Failed one', status: 'failed', kind: 'failed' }),
        ],
      },
      {
        key: 'review',
        cards: [
          card({
            id: 'v1',
            title: 'Review one',
            status: 'review',
            kind: 'review',
            branch: 'x',
            changes: 3,
            added: 42,
            removed: 8,
          }),
        ],
      },
      { key: 'done', cards: [] },
    ],
    strings: STRINGS,
    ...overrides,
  };
}

/** カード 1 枚分の HTML */
function cardHtml(html: string, id: string): string {
  const start = html.indexOf(`data-task="${id}"`);
  const end = html.indexOf('</article>', start);
  return html.slice(start, end);
}

suite('webview: タスクボード', () => {
  test('5 つの列を出し、カードは自分の列に入る', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.strictEqual(html.split('class="column"').length - 1, 5);
    assert.ok(html.includes('Draft one'));
    assert.ok(html.includes('Review one'));
  });

  test('列の見出しは点ではなくアイコン。件数は文字だけ', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(!html.includes('class="dot"'));
    assert.ok(/class="codicon codicon-bell column-icon"[^>]*data-column="waiting"/.test(html));
    assert.ok(
      /class="codicon codicon-git-compare column-icon"[^>]*data-column="review"/.test(html)
    );
    assert.ok(/class="codicon codicon-sync codicon-modifier-spin column-icon"/.test(html));
    assert.ok(/class="count"[^>]*>3</.test(html));
  });

  test('あなたの番のカードには理由のバッジが付く', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/class="badge replied"[^>]*>Replied/.test(cardHtml(html, 'w1')));
    assert.ok(/class="badge approval"[^>]*>Needs approval/.test(cardHtml(html, 'w2')));
    assert.ok(/class="badge failed"[^>]*>Failed/.test(cardHtml(html, 'f1')));
    assert.ok(!cardHtml(html, 'v1').includes('class="badge'));
  });

  test('モデル・ブランチ・経過・変更は淡色の 1 行にまとめる。チップは使わない', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(!html.includes('class="chip'));
    assert.ok(cardHtml(html, 'd1').includes('sonnet-5'));
    assert.ok(!cardHtml(html, 'd1').includes('claude-sonnet-5'));
    assert.ok(cardHtml(html, 'r1').includes('3 min'));
    const review = cardHtml(html, 'v1');
    assert.ok(review.includes('3 files'));
    assert.ok(review.includes('>x<'));
    assert.ok(review.includes('+42'));
    assert.ok(review.includes('−8'));
    assert.ok(cardHtml(html, 'd1').includes('do later'));
  });

  test('操作は状態ごとに 1 つだけ', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    const actions = (id: string): string[] =>
      [...cardHtml(html, id).matchAll(/class="action ([a-zA-Z-]+)"/g)].map((m) => m[1] ?? '');
    assert.deepStrictEqual(actions('d1'), ['start']);
    assert.deepStrictEqual(actions('r1'), ['stop']);
    assert.deepStrictEqual(actions('w1'), ['markDone']);
    assert.deepStrictEqual(actions('w2'), ['open']);
    assert.deepStrictEqual(actions('f1'), ['open']);
    assert.deepStrictEqual(actions('v1'), ['approve']);
    assert.ok(cardHtml(html, 'v1').includes('Approve and finish'));
    assert.ok(!html.includes('class="action delete"'));
    assert.ok(!html.includes('class="action fork"'));
    assert.ok(!html.includes('class="action edit"'));
  });

  test('切り出す・編集・削除は右クリックのメニューに出すため、カードに data-vscode-context を付ける', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    const match = html.match(/data-task="v1"[^>]*data-vscode-context="([^"]*)"/);
    assert.ok(match, 'context が無い');
    const context = JSON.parse((match?.[1] ?? '').replace(/&quot;/g, '"')) as Record<
      string,
      unknown
    >;
    assert.strictEqual(context.webviewSection, 'task');
    assert.strictEqual(context.taskId, 'v1');
    assert.strictEqual(context.foremanStatus, 'review');
    assert.strictEqual(context.foremanOpen, false);
    assert.strictEqual(context.preventDefaultContextMenuItems, true);
  });

  test('空の列には、そこでできることを書く', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/class="empty"[^>]*>Drag reviewed cards here to finish them/.test(html));
  });

  test('カードはドラッグでき、列はドロップ先になる', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/<article[^>]*class="card"[^>]*draggable/.test(html));
    assert.ok(/<section[^>]*class="column"[^>]*data-column="review"/.test(html));
  });

  test('理由のバッジがあるカードは attention、動いているカードは live が付く', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/data-task="w1"[^>]*data-attention="true"/.test(html));
    assert.ok(!/data-task="v1"[^>]*data-attention="true"/.test(html));
    assert.ok(/data-task="r1"[^>]*data-live="true"/.test(html));
  });

  test('メッセージの型', () => {
    const messages: FromBoard[] = [
      { type: 'move', id: 'd1', to: 'running' },
      { type: 'reorder', column: 'done', ids: ['a', 'b'] },
      { type: 'newDraft' },
      { type: 'open', id: 'x' },
      { type: 'start', id: 'x' },
      { type: 'stop', id: 'x' },
      { type: 'approve', id: 'x' },
    ];
    assert.strictEqual(messages.length, 7);
  });
});
