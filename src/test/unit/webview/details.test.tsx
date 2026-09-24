import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { Details } from '../../../webview/details/Details';
import type { DetailsState, FromDetails } from '../../../webview/detailsProtocol';
import { DETAILS_STRINGS } from '../../support/panelStrings';

const STRINGS = DETAILS_STRINGS;

function state(overrides: Partial<DetailsState> = {}): DetailsState {
  return {
    task: {
      id: 't1',
      title: 'Fix README',
      status: 'review',
      kind: 'review',
      turnOpen: false,
      mergeable: false,
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
    assert.ok(!html.includes('class="turn'));
  });

  test('タスクの題名と状態（サイドバーと同じ呼び名）、ターンごとの変更ファイルを出す', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(html.includes('Fix README'));
    assert.ok(/class="status"[^>]*data-kind="review"[^>]*>Review</.test(html));
    assert.ok(html.includes('README.md'));
    assert.ok(html.includes('docs/a.md'));
    assert.ok(html.includes('+2'));
    assert.ok(html.includes('−1'));
    assert.ok(/data-path="docs\/a.md"[\s\S]*?Reverted/.test(html));
    assert.strictEqual(html.split('<section class="turn').length - 1, 2);
  });

  test('変更が無いターンは 1 行にまとめ、「変更なし」と出す', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(
      /class="turn compact"[\s\S]*?Turn 2[\s\S]*?class="no-changes"[^>]*>No changes</.test(html)
    );
  });

  test('チェックポイントの操作はアイコンにする', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(
      /class="icon-button rewind"[^>]*title="Rewind to here"[^>]*><i[^>]*codicon-discard/.test(html)
    );
    assert.ok(
      /class="icon-button fork"[^>]*title="Fork from here"[^>]*><i[^>]*codicon-git-branch/.test(
        html
      )
    );
  });

  test('変更が 1 つも無いタスクは、見出しの横に「なし」と出す', () => {
    const html = render(
      <Details
        state={state({
          task: { ...state().task!, turns: [{ index: 0, prompt: 'p', ok: true, changes: [] }] },
        })}
        post={() => {}}
      />
    );
    assert.ok(/class="changes-title"[\s\S]*?class="none"[^>]*>None</.test(html));
  });

  test('実行中はチェックポイントの操作を押せない', () => {
    const html = render(
      <Details
        state={state({
          task: { ...state().task!, status: 'running', kind: 'running', turnOpen: true },
        })}
        post={() => {}}
      />
    );
    assert.ok(/<button[^>]*class="icon-button rewind"[^>]*disabled/.test(html));
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

suite('webview: 右サイドバーの仕上げ（worktree）', () => {
  const worktree = { branch: 'x', base: 'main' };

  test('承認 → 全体の差分 → マージの手順を並べ、ブランチの行き先を見出しの横に出す', () => {
    const html = render(
      <Details
        state={state({
          task: { ...state().task!, status: 'done', kind: 'done', worktree, mergeable: true },
        })}
        post={() => {}}
      />
    );
    const finish = html.slice(html.indexOf('class="finish"'));
    assert.ok(
      /class="finish-title"[^>]*>Finish<[\s\S]*?class="finish-route"[^>]*>x → main</.test(finish)
    );
    assert.ok(
      /codicon-pass-filled[\s\S]*?Changes approved \(1 turns · 1 files\)/.test(finish),
      '戻したファイルは数えない'
    );
    assert.ok(
      /Review the whole diff[\s\S]*?\+2[\s\S]*?−1[\s\S]*?class="finish-button all-diff"/.test(
        finish
      )
    );
    assert.ok(
      /Bring the changes into main[\s\S]*?class="finish-button merge primary"[^>]*>Merge into main</.test(
        finish
      )
    );
    assert.ok(
      /class="finish-footer"[\s\S]*?End without merging[\s\S]*?class="finish-button discard"[^>]*>Discard worktree…</.test(
        finish
      )
    );
  });

  test('未承認なら最初の手順は「変更を承認する」で、マージは押せない', () => {
    const html = render(
      <Details
        state={state({ task: { ...state().task!, worktree, mergeable: false } })}
        post={() => {}}
      />
    );
    const finish = html.slice(html.indexOf('class="finish"'));
    assert.ok(/codicon-circle-large-outline[\s\S]*?Approve the changes/.test(finish));
    assert.ok(/<button[^>]*class="finish-button merge primary"[^>]*disabled/.test(finish));
  });

  test('変更が無ければ「マージするものはありません」と理由を出し、破棄だけを下段に置く', () => {
    const html = render(
      <Details
        state={state({
          task: {
            ...state().task!,
            status: 'waiting',
            kind: 'replied',
            worktree,
            turns: [{ index: 0, prompt: 'p', ok: true, changes: [] }],
          },
        })}
        post={() => {}}
      />
    );
    const finish = html.slice(html.indexOf('class="finish"'));
    assert.ok(finish.includes('Nothing to merge'));
    assert.ok(finish.includes('No files have changed in this task yet.'));
    assert.ok(!finish.includes('class="finish-button all-diff"'));
    assert.ok(!finish.includes('class="finish-button merge'));
    assert.ok(/End without keeping anything[\s\S]*?Discard worktree…/.test(finish));
  });

  test('worktree でないタスクには全体の差分だけを出す', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(html.includes('class="finish-button all-diff"'));
    assert.ok(!html.includes('class="finish-title"'));
  });

  test('見出しに全ターンの行数の合計を出す', () => {
    const html = render(<Details state={state()} post={() => {}} />);
    assert.ok(html.includes('+12'));
    assert.ok(html.includes('−1'));
  });

  test('メッセージの型: allDiff、merge、discard', () => {
    const messages: FromDetails[] = [{ type: 'allDiff' }, { type: 'merge' }, { type: 'discard' }];
    assert.strictEqual(messages.length, 3);
  });
});
