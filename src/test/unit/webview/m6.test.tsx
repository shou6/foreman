import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import type { PanelState, ToExtension } from '../../../webview/protocol';
import { reduce } from '../../../webview/state';
import { PANEL_STRINGS } from '../../support/panelStrings';

const STRINGS = PANEL_STRINGS;

function state(overrides: Partial<PanelState>): PanelState {
  return {
    taskId: 'task-1',
    title: 'README',
    status: 'done',
    turnOpen: false,
    mergeable: false,
    items: [],
    changes: {},
    diffs: {},
    attachments: [],
    models: [
      { value: 'opus', label: 'Opus', description: 'Opus 5.5', resolved: 'claude-opus-5-5' },
      { value: 'sonnet', label: 'Sonnet', description: 'Sonnet 5', resolved: 'claude-sonnet-5' },
    ],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 添付とモデル', () => {
  test('attachments メッセージで添付の一覧が入れ替わる', () => {
    const s = reduce(state({}), {
      type: 'attachments',
      attachments: [{ kind: 'file', path: 'a.ts' }],
    });
    assert.deepStrictEqual(s?.attachments, [{ kind: 'file', path: 'a.ts' }]);
  });

  test('添付があれば入力欄の上にチップとして出す', () => {
    const html = render(
      <App
        state={state({ attachments: [{ kind: 'file', path: 'D:\\w\\a.ts' }] })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="attachment'));
    assert.ok(html.includes('a.ts'));
    assert.ok(html.includes('Remove'));
  });

  test('モデルの選択肢は画面用の名前で出し、説明はホバーで出す。指定中のモデルが選ばれている', () => {
    const html = render(
      <App
        state={state({
          model: 'sonnet',
          defaultModel: {
            value: 'default',
            label: 'Default (recommended)',
            description: 'Opus 5.5 with 1M context',
            resolved: 'claude-opus-5-5[1m]',
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(
      /<option[^>]*value(="")?\s[^>]*title="Opus 5.5 with 1M context"[^>]*>Default \(Opus 5.5\)</.test(
        html
      ),
      '既定には推奨モデルの名前を添える'
    );
    assert.ok(
      /<option[^>]*value="sonnet"[^>]*title="Sonnet 5"[^>]*selected[^>]*>Sonnet</.test(html)
    );
    assert.ok(/<option[^>]*value="opus"[^>]*>Opus</.test(html));
  });

  test('正式な ID（claude-sonnet-5）で指定されていても、中身が同じ選択肢（Sonnet）を選んだ状態で出し、別の選択肢は足さない', () => {
    const html = render(<App state={state({ model: 'claude-sonnet-5' })} post={() => {}} />);
    assert.ok(/<option[^>]*value="sonnet"[^>]*selected[^>]*>Sonnet</.test(html));
    assert.ok(!html.includes('value="claude-sonnet-5"'));
    const same = render(
      <App
        state={state({ model: 'claude-sonnet-5', activeModel: 'claude-sonnet-5' })}
        post={() => {}}
      />
    );
    assert.ok(!same.includes('class="previous-model"'));
  });

  test('一覧に無いモデルが指定されていても選択肢に出す', () => {
    const html = render(<App state={state({ model: 'claude-custom' })} post={() => {}} />);
    assert.ok(/<option[^>]*value="claude-custom"[^>]*selected/.test(html));
  });

  test('models メッセージでモデルの一覧が入れ替わる', () => {
    const models = [{ value: 'haiku', label: 'Haiku', description: '' }];
    const s = reduce(state({}), { type: 'models', models, defaultModel: undefined });
    assert.deepStrictEqual(s?.models, models);
  });

  test('前のターンで動いたモデルが次のモデルと違えば、入力欄に「前のターン」として小さく出す', () => {
    const differs = render(
      <App state={state({ model: 'sonnet', activeModel: 'claude-haiku-4-5' })} post={() => {}} />
    );
    const footer = differs.slice(differs.indexOf('<footer'));
    assert.ok(/class="previous-model"[^>]*>Previous turn: haiku-4-5</.test(footer));
    const listed = render(
      <App state={state({ model: 'opus', activeModel: 'claude-sonnet-5' })} post={() => {}} />
    );
    assert.ok(listed.includes('Previous turn: Sonnet'), '一覧にあれば画面用の名前');
  });

  test('名前（sonnet）と実際のモデル（claude-sonnet-5）が同じなら出さない。既定も実際のモデルで比べる', () => {
    const same = render(
      <App state={state({ model: 'sonnet', activeModel: 'claude-sonnet-5' })} post={() => {}} />
    );
    assert.ok(!same.includes('class="previous-model"'));
    const byDefault = render(
      <App
        state={state({
          model: undefined,
          activeModel: 'claude-opus-5-5[1m]',
          defaultModel: {
            value: 'default',
            label: 'Default',
            description: '',
            resolved: 'claude-opus-5-5[1m]',
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(!byDefault.includes('class="previous-model"'));
    const unknown = render(
      <App state={state({ model: undefined, activeModel: 'claude-opus-5[1m]' })} post={() => {}} />
    );
    assert.ok(unknown.includes('Previous turn: opus-5[1m]'), '既定の中身が分からなければ出す');
  });

  test('setModel、dropped、添付つきの send の型がある', () => {
    const messages: ToExtension[] = [
      { type: 'setModel', model: 'claude-opus-5' },
      { type: 'setModel', model: undefined },
      { type: 'dropped', uris: ['file:///d%3A/w/a.ts'] },
      { type: 'send', prompt: 'p', attachments: [{ kind: 'file', path: 'D:\\w\\a.ts' }] },
      { type: 'removeAttachment', key: 'file:D:\\w\\a.ts' },
    ];
    assert.strictEqual(messages.length, 5);
  });
});

suite('webview: 状態の表示名', () => {
  test('状態のバッジは翻訳した表示名を出す', () => {
    const html = render(<App state={state({ status: 'done' })} post={() => {}} />);
    assert.ok(html.includes('>Done<'));
    assert.ok(!html.includes('>done<'));
  });
});

suite('webview: Effort', () => {
  const models = [
    {
      value: 'sonnet',
      label: 'Sonnet',
      description: '',
      resolved: 'claude-sonnet-5',
      efforts: ['low' as const, 'medium' as const, 'high' as const],
    },
    { value: 'haiku', label: 'Haiku', description: '', efforts: [] },
  ];

  function slider(html: string): string {
    const footer = html.slice(html.indexOf('<footer'));
    return footer.slice(footer.indexOf('class="effort-slider"'));
  }

  test('モデルの横に、選んだモデルが対応する段階の数だけ目盛りのあるスライダーを出す', () => {
    const html = render(
      <App state={state({ models, model: 'sonnet', effort: 'high' })} post={() => {}} />
    );
    const footer = html.slice(html.indexOf('<footer'));
    assert.ok(footer.indexOf('class="model-select"') < footer.indexOf('class="effort-slider"'));
    const s = slider(html);
    assert.ok(/<input[^>]*type="range"/.test(s));
    assert.ok(/min="0"/.test(s) && /max="2"/.test(s), 'low / medium / high の 3 段階');
    assert.ok(/value="2"/.test(s), 'high は 3 つ目');
    assert.ok(/class="effort-value"[^>]*>High</.test(s));
    assert.ok(!html.includes('<option value="low"'), 'プルダウンはやめる');
  });

  test('Effort を指定していなければ、実際に使われる Effort の段階を選んだ状態で出す。「既定」は出さない', () => {
    const html = render(
      <App
        state={state({ models, model: 'sonnet', effort: undefined, activeEffort: 'medium' })}
        post={() => {}}
      />
    );
    const s = slider(html);
    assert.ok(/value="1"/.test(s));
    assert.ok(/class="effort-value"[^>]*>Medium</.test(s));
    // 「Effort: default」のような既定の段階は出さない（承認方式の default は別物）
    assert.ok(!slider(html).includes('default'));
    assert.ok(!html.includes('Effort: default'));
  });

  test('実際の Effort が分からなければ、段階の名前の代わりに — を出す', () => {
    const html = render(<App state={state({ models, model: 'sonnet' })} post={() => {}} />);
    assert.ok(/class="effort-value"[^>]*>—</.test(slider(html)));
  });

  test('Effort に対応していないモデル（Haiku）ではスライダーを出さない', () => {
    const html = render(<App state={state({ models, model: 'haiku' })} post={() => {}} />);
    assert.ok(!html.includes('class="effort-slider"'));
  });

  test('task メッセージで Effort と実際の Effort が入れ替わり、setEffort のメッセージの型がある', () => {
    const s = reduce(state({}), {
      type: 'task',
      status: 'done',
      turnOpen: false,
      mergeable: false,
      title: 't',
      effort: 'low',
      activeEffort: 'high',
    });
    assert.strictEqual(s?.effort, 'low');
    assert.strictEqual(s?.activeEffort, 'high');
    const message: ToExtension = { type: 'setEffort', effort: 'max' };
    assert.strictEqual(message.type, 'setEffort');
  });
});

suite('webview: プランモードの切り替え', () => {
  test('入力欄に「計画だけ」のトグルがあり、承認方式が plan なら入になる', () => {
    const off = render(<App state={state({ permissionMode: 'default' })} post={() => {}} />);
    assert.ok(/<input[^>]*class="plan-toggle"[^>]*type="checkbox"(?![^>]*checked)/.test(off));
    assert.ok(off.includes('Plan only'));
    const on = render(<App state={state({ permissionMode: 'plan' })} post={() => {}} />);
    assert.ok(/<input[^>]*class="plan-toggle"[^>]*checked/.test(on));
  });

  test('task メッセージで承認方式が入れ替わり、setPermissionMode のメッセージの型がある', () => {
    const s = reduce(state({}), {
      type: 'task',
      status: 'done',
      turnOpen: false,
      mergeable: false,
      title: 't',
      permissionMode: 'plan',
    });
    assert.strictEqual(s?.permissionMode, 'plan');
    const message: ToExtension = { type: 'setPermissionMode', mode: 'plan' };
    assert.strictEqual(message.type, 'setPermissionMode');
  });
});
