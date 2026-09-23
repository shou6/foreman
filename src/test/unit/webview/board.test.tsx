import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Board } from '../../../webview/board/Board';
import type { BoardState, FromBoard } from '../../../webview/boardProtocol';

const STRINGS = {
  columns: {
    draft: 'Draft',
    running: 'Running',
    waiting: 'Waiting for input',
    review: 'Review',
    done: 'Done',
  },
  badges: { failed: 'Failed', interrupted: 'Interrupted' },
  newDraft: 'New draft',
  start: 'Start',
  approve: 'Approve',
  markDone: 'Mark as done',
  stop: 'Stop',
  edit: 'Edit',
  fork: 'Fork',
  delete: 'Delete',
  files: 'files',
  empty: 'No tasks',
  minutes: '{0} min',
};

function state(overrides: Partial<BoardState> = {}): BoardState {
  return {
    columns: [
      {
        key: 'draft',
        cards: [
          {
            id: 'd1',
            title: 'Draft one',
            status: 'draft',
            turnOpen: false,
            prompt: 'do later',
            changes: 0,
            updatedAt: '',
          },
        ],
      },
      {
        key: 'running',
        cards: [
          {
            id: 'r1',
            title: 'Run one',
            status: 'failed',
            turnOpen: false,
            badge: 'failed',
            changes: 0,
            updatedAt: '',
          },
        ],
      },
      { key: 'waiting', cards: [] },
      {
        key: 'review',
        cards: [
          {
            id: 'v1',
            title: 'Review one',
            status: 'review',
            turnOpen: false,
            branch: 'foreman/x',
            changes: 3,
            updatedAt: '',
          },
        ],
      },
      { key: 'done', cards: [] },
    ],
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: タスクボード', () => {
  test('5 つの列を出し、カードは自分の列に入る', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.strictEqual(html.split('class="column"').length - 1, 5);
    assert.ok(html.includes('Draft one'));
    assert.ok(html.includes('Review one'));
    assert.ok(html.includes('No tasks'));
  });

  test('失敗のカードにはバッジ、レビュー待ちには変更の件数とブランチ、下書きには指示が出る', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/class="badge failed"[^>]*>Failed/.test(html));
    assert.ok(html.includes('3 files'));
    assert.ok(html.includes('foreman/x'));
    assert.ok(html.includes('do later'));
  });

  test('列ごとの操作: 下書きは開始と編集、実行中は停止、レビュー待ちは承認', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/data-task="d1"[\s\S]*?class="action start"/.test(html));
    assert.ok(/data-task="d1"[\s\S]*?class="action edit"/.test(html));
    assert.ok(/data-task="v1"[\s\S]*?class="action approve"/.test(html));
    const running = render(
      <Board
        state={state({
          columns: [
            { key: 'draft', cards: [] },
            {
              key: 'running',
              cards: [
                {
                  id: 'r2',
                  title: 'Run',
                  status: 'running',
                  turnOpen: true,
                  changes: 0,
                  updatedAt: '',
                },
              ],
            },
            { key: 'waiting', cards: [] },
            { key: 'review', cards: [] },
            { key: 'done', cards: [] },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/data-task="r2"[\s\S]*?class="action stop"/.test(running));
  });

  test('カードはドラッグでき、列はドロップ先になる', () => {
    const html = render(<Board state={state()} post={() => {}} />);
    assert.ok(/<article[^>]*class="card"[^>]*draggable/.test(html));
    assert.ok(/<section[^>]*class="column"[^>]*data-column="review"/.test(html));
  });

  test('メッセージの型: move と reorder', () => {
    const messages: FromBoard[] = [
      { type: 'move', id: 'd1', to: 'running' },
      { type: 'reorder', column: 'done', ids: ['a', 'b'] },
      { type: 'newDraft' },
      { type: 'open', id: 'x' },
    ];
    assert.strictEqual(messages.length, 4);
  });
});

suite('webview: タスクボードの強調', () => {
  test('入力待ちのカードは attention、動いているカードは live が付く', () => {
    const html = render(
      <Board
        state={state({
          columns: [
            { key: 'draft', cards: [] },
            {
              key: 'running',
              cards: [
                {
                  id: 'r2',
                  title: 'Run',
                  status: 'running',
                  turnOpen: true,
                  changes: 0,
                  updatedAt: '',
                  elapsedMinutes: 4,
                },
              ],
            },
            {
              key: 'waiting',
              cards: [
                {
                  id: 'w1',
                  title: 'Wait',
                  status: 'waiting',
                  turnOpen: true,
                  changes: 0,
                  updatedAt: '',
                },
              ],
            },
            { key: 'review', cards: [] },
            { key: 'done', cards: [] },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/data-task="w1"[^>]*data-attention="true"/.test(html));
    assert.ok(/data-task="r2"[^>]*data-live="true"/.test(html));
    assert.ok(html.includes('4 min'));
  });

  test('列の見出しに状態の点が付き、変更の行数がカードに出る', () => {
    const html = render(
      <Board
        state={state({
          columns: [
            { key: 'draft', cards: [] },
            { key: 'running', cards: [] },
            { key: 'waiting', cards: [] },
            {
              key: 'review',
              cards: [
                {
                  id: 'v1',
                  title: 'Review',
                  status: 'review',
                  turnOpen: false,
                  changes: 2,
                  added: 88,
                  removed: 0,
                  updatedAt: '',
                },
              ],
            },
            { key: 'done', cards: [] },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(/class="dot"[^>]*data-column="review"/.test(html));
    assert.ok(html.includes('+88'));
    assert.ok(html.includes('-0'));
  });
});
