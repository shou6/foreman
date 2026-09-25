import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState } from '../../../webview/protocol';
import { Details } from '../../../webview/details/Details';
import type { DetailsState } from '../../../webview/detailsProtocol';
import { DETAILS_STRINGS, PANEL_STRINGS } from '../../support/panelStrings';

/** 今日と昨日の、手元の時刻の正午 */
function noon(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}
const plus = (d: Date, seconds: number): string =>
  new Date(d.getTime() + seconds * 1000).toISOString();

const YESTERDAY = noon(1);
const TODAY = noon(0);

function state(overrides: Partial<PanelState> = {}): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'waiting',
    turnOpen: false,
    mergeable: false,
    items: [
      { kind: 'prompt', turn: 0, text: 'first' },
      { kind: 'text', turn: 0, text: 'ok' },
      { kind: 'turn-end', turn: 0, ok: true },
      { kind: 'prompt', turn: 1, text: 'second' },
      { kind: 'turn-end', turn: 1, ok: true },
    ],
    turnTimes: [
      { startedAt: YESTERDAY.toISOString(), endedAt: plus(YESTERDAY, 48) },
      { startedAt: TODAY.toISOString(), endedAt: plus(TODAY, 72) },
    ],
    locale: 'en-US',
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: PANEL_STRINGS,
    ...overrides,
  };
}

suite('webview: いつのやり取りか（タスク画面）', () => {
  test('最初のターンの前と、日付が変わったターンの前に、日付の区切りを入れる', () => {
    const html = render(<App state={state()} post={() => {}} />);
    const labels = [...html.matchAll(/<div class="day-divider"><span>([^<]*)<\/span><\/div>/g)].map(
      (m) => m[1] ?? ''
    );
    assert.strictEqual(labels.length, 2);
    assert.ok(labels[0]?.startsWith('Yesterday · '), labels[0]);
    assert.ok(labels[1]?.startsWith('Today · '), labels[1]);
    assert.ok(html.indexOf('class="day-divider"') < html.indexOf('class="item prompt"'));
  });

  test('指示の横に送った時刻（時と分）を出し、マウスで完全な日時を出す', () => {
    const html = render(<App state={state()} post={() => {}} />);
    const times = [
      ...html.matchAll(/<span class="prompt-time" title="[^"]+">(\d\d:\d\d)<\/span>/g),
    ];
    assert.strictEqual(times.length, 2);
  });

  test('送った時刻は吹き出しの下に置く（長い指示でも位置が変わらない）', () => {
    const html = render(<App state={state()} post={() => {}} />);
    assert.ok(
      /<div class="prompt-row"><div class="item prompt">[\s\S]*?<\/div><span class="prompt-time"/.test(
        html
      )
    );
  });

  test('ターンの区切りに、終わった時刻と所要時間を出す', () => {
    const html = render(<App state={state()} post={() => {}} />);
    assert.ok(/class="turn-time"[^>]*>\d\d:\d\d · 48s</.test(html));
    assert.ok(/class="turn-time"[^>]*>\d\d:\d\d · 1m 12s</.test(html));
  });

  test('時刻が無ければ（古い記録）何も足さない', () => {
    const html = render(<App state={state({ turnTimes: undefined })} post={() => {}} />);
    assert.ok(!html.includes('day-divider'));
    assert.ok(!html.includes('prompt-time'));
    assert.ok(!html.includes('turn-time'));
  });
});

suite('webview: いつのやり取りか（右サイドバー）', () => {
  function details(withTimes: boolean): DetailsState {
    return {
      task: {
        id: 't1',
        title: 'README',
        status: 'waiting',
        kind: 'replied',
        turnOpen: false,
        mergeable: false,
        turns: [
          {
            index: 0,
            prompt: 'a',
            ok: true,
            changes: [],
            startedAt: withTimes ? plus(YESTERDAY, -60) : undefined,
          },
          {
            index: 1,
            prompt: 'b',
            ok: true,
            changes: [],
            startedAt: withTimes ? YESTERDAY.toISOString() : undefined,
          },
          {
            index: 2,
            prompt: 'c',
            ok: true,
            changes: [],
            startedAt: withTimes ? TODAY.toISOString() : undefined,
          },
        ],
      },
      locale: 'en-US',
      strings: DETAILS_STRINGS,
    };
  }

  test('ターンの一覧は、日付の見出しでまとめる（新しい順）。行には時刻を出さない', () => {
    const html = render(<Details state={details(true)} post={() => {}} />);
    const days = [...html.matchAll(/<div class="turn-day">([^<]*)<\/div>/g)].map((m) => m[1]);
    assert.deepStrictEqual(days, ['Today', 'Yesterday']);
    assert.ok(
      html.indexOf('>Today<') < html.indexOf('>c<') ||
        html.indexOf('>Today<') < html.indexOf('title="c"')
    );
  });

  test('時刻が無ければ見出しを出さない', () => {
    const html = render(<Details state={details(false)} post={() => {}} />);
    assert.ok(!html.includes('turn-day'));
  });
});
