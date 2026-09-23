import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Details } from '../../../webview/details/Details';
import type { DetailsState, FromDetails } from '../../../webview/detailsProtocol';

const STRINGS = {
  noTask: 'Open a task to see its changes here.',
  changes: 'Changes',
  checkpoints: 'Checkpoints',
  turn: 'Turn {0}',
  openDiff: 'Open diff',
  revert: 'Revert',
  reverted: 'Reverted',
  rewindHere: 'Rewind to here',
  forkHere: 'Fork from here',
  noChanges: 'No changes yet',
  finish: 'Finish the task',
  finishHint: 'Review the whole diff before merging the worktree into {0}.',
  allDiff: 'Whole diff',
  merge: 'Merge into {0}',
  discard: 'Discard',
  changesTitle: 'Changes in this task',
  statusLabels: {
    draft: 'Draft',
    running: 'Running',
    waiting: 'Waiting for input',
    review: 'Review',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
};

function state(overrides: Partial<DetailsState> = {}): DetailsState {
  return {
    task: {
      id: 't1',
      title: 'Fix README',
      status: 'review',
      turnOpen: false,
      turns: [
        {
          index: 0,
          prompt: 'first',
          ok: true,
          changes: [
            { path: 'README.md', kind: 'modified', added: 2, removed: 1, reverted: false },
            { path: 'docs/a.md', kind: 'created', added: 10, removed: 0, reverted: true },
          ],
        },
        { index: 1, prompt: 'second', ok: true, changes: [] },
      ],
    },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 右サイドバー（このタスクの変更とチェックポイント）', () => {
  test('タスクが無ければ案内だけ出す', () => {
    const html = render(<Details state={{ task: undefined, strings: STRINGS }} post={() => {}} />);
    assert.ok(html.includes('Open a task to see its changes here.'));
    assert.ok(!html.includes('class="turn"'));
  });

  test('タスクの題名と状態、ターンごとの変更ファイルを出す', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(html.includes('Fix README'));
    assert.ok(html.includes('Review'));
    assert.ok(html.includes('README.md'));
    assert.ok(html.includes('docs/a.md'));
    assert.ok(html.includes('+2'));
    assert.ok(html.includes('-1'));
    assert.ok(/data-path="docs\/a.md"[\s\S]*?Reverted/.test(html));
    assert.strictEqual(html.split('class="turn"').length - 1, 2);
  });

  test('正常に終わったターンにはチェックポイントの操作、変更が無いターンには「変更なし」', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(html.includes('Rewind to here'));
    assert.ok(html.includes('Fork from here'));
    assert.ok(html.includes('No changes yet'));
  });

  test('実行中はチェックポイントの操作を押せない', () => {
    const html = render(
      <Details
        state={state({ task: { ...state().task!, status: 'running', turnOpen: true } })}
        post={() => {}}
      />
    );
    assert.ok(/<button[^>]*class="link rewind"[^>]*disabled/.test(html));
  });

  test('メッセージの型', () => {
    const messages: FromDetails[] = [
      { type: 'ready' },
      { type: 'open' },
      { type: 'openDiff', turn: 0, path: 'README.md' },
      { type: 'revert', turn: 0, path: 'README.md' },
      { type: 'rewind', turn: 0 },
      { type: 'fork', turn: 1 },
    ];
    assert.strictEqual(messages.length, 6);
  });
});

suite('webview: 右サイドバーのタスクの仕上げ', () => {
  const finishStrings = {
    ...STRINGS,
    finish: 'Finish the task',
    finishHint: 'Review the whole diff before merging the worktree into {0}.',
    allDiff: 'Whole diff',
    merge: 'Merge into {0}',
    discard: 'Discard',
    changesTitle: 'Changes in this task',
  };

  test('worktree のタスクには、全体の差分・破棄・マージのボタンを出す', () => {
    const html = render(
      <Details
        state={{
          ...state(),
          task: { ...state().task!, worktree: { branch: 'foreman/x', base: 'main' } },
          strings: finishStrings,
        }}
        post={() => {}}
      />
    );
    assert.ok(html.includes('Finish the task'));
    assert.ok(html.includes('class="finish-button all-diff"'));
    assert.ok(html.includes('Merge into main'));
    assert.ok(html.includes('class="finish-button discard"'));
  });

  test('worktree でないタスクには全体の差分だけを出す', () => {
    const html = render(<Details state={{ ...state(), strings: finishStrings }} post={() => {}} />);
    assert.ok(html.includes('class="finish-button all-diff"'));
    assert.ok(!html.includes('Finish the task'));
  });

  test('見出しに全ターンの行数の合計を出す', () => {
    const html = render(<Details state={{ ...state(), strings: finishStrings }} post={() => {}} />);
    assert.ok(html.includes('+12'));
    assert.ok(html.includes('-1'));
  });

  test('メッセージの型: allDiff、merge、discard', () => {
    const messages: FromDetails[] = [{ type: 'allDiff' }, { type: 'merge' }, { type: 'discard' }];
    assert.strictEqual(messages.length, 3);
  });
});
