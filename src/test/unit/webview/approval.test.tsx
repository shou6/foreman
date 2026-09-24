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
    status: 'waiting',
    turnOpen: true,
    mergeable: false,
    items: [],
    changes: {},
    diffs: {},
    attachments: [],
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: false,
    presets: [],
    context: { cwd: 'D:\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: STRINGS,
    ...overrides,
  };
}

suite('webview: 承認カード', () => {
  test('pending メッセージで承認の要求が状態に入り、undefined で消える', () => {
    const pending = {
      id: 'req-1',
      toolName: 'Edit',
      input: { file_path: 'a.txt' },
      suggestions: [],
    };
    let s = reduce(state({}), { type: 'pending', pending });
    assert.deepStrictEqual(s?.pending, pending);
    s = reduce(s, { type: 'pending', pending: undefined });
    assert.strictEqual(s?.pending, undefined);
  });

  test('ツールの承認カードは問いかけの見出しと、対象のコードブロック、許可・常に許可・拒否…のボタンを出す', () => {
    const html = render(
      <App
        state={state({
          pending: {
            id: 'req-1',
            toolName: 'Bash',
            input: { command: 'npm test' },
            suggestions: [
              {
                type: 'addRules',
                behavior: 'allow',
                destination: 'session',
                rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
              },
            ],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="approval'));
    assert.ok(
      /class="approval-title"[^>]*><i[^>]*codicon-shield[^>]*><\/i>Run this command\?/.test(html)
    );
    assert.ok(/<pre class="approval-target">npm test<\/pre>/.test(html));
    assert.ok(html.includes('Input details (JSON)'));
    assert.ok(/class="action allow"[^>]*>Allow</.test(html));
    assert.ok(
      /class="action allow-always"[^>]*>Always allow<span class="always-scope">Bash\(npm test\)<\/span>/.test(
        html
      )
    );
    assert.ok(/class="action deny"[^>]*>Deny…</.test(html));
  });

  test('理由の欄は「拒否…」を押すまで出さない', () => {
    const html = render(
      <App
        state={state({
          pending: { id: 'req-1', toolName: 'Bash', input: { command: 'ls' }, suggestions: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(!html.includes('class="deny-reason"'));
  });

  test('問いかけはツールの種類で変わる', () => {
    const titleOf = (toolName: string, input: Record<string, unknown>): string => {
      const html = render(
        <App
          state={state({ pending: { id: 'r', toolName, input, suggestions: [] } })}
          post={() => {}}
        />
      );
      return html.slice(
        html.indexOf('class="approval-title"'),
        html.indexOf('</div>', html.indexOf('class="approval-title"'))
      );
    };
    assert.ok(titleOf('Edit', { file_path: 'a.ts' }).includes('Edit this file?'));
    assert.ok(titleOf('WebFetch', { url: 'https://x' }).includes('Access the web?'));
    assert.ok(titleOf('mcp__x__y', {}).includes('Use mcp__x__y?'));
  });

  test('提案が無ければ「常に許可」は出さない', () => {
    const html = render(
      <App
        state={state({
          pending: { id: 'req-1', toolName: 'Bash', input: { command: 'ls' }, suggestions: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(!html.includes('Always allow'));
  });

  test('AskUserQuestion は質問のカードになる。選択肢は番号付きの行で、説明は 2 行目。最後に「その他」', () => {
    const html = render(
      <App
        state={state({
          pending: {
            id: 'req-1',
            toolName: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Which section?',
                  header: 'Section',
                  multiSelect: false,
                  options: [
                    { label: 'Usage', description: 'Add to Usage' },
                    { label: 'New', description: 'Create a new section' },
                  ],
                },
              ],
            },
            suggestions: [],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('class="question'));
    assert.ok(/codicon-question/.test(html));
    assert.ok(!html.includes('codicon-shield'));
    assert.ok(/class="question-header"[^>]*>Section</.test(html));
    assert.ok(html.includes('Which section?'));
    assert.ok(
      /class="option-key"[^>]*>1<[\s\S]*?Usage[\s\S]*?class="option-description"[^>]*>Add to Usage/.test(
        html
      )
    );
    assert.ok(/class="option-key"[^>]*>2<[\s\S]*?New/.test(html));
    assert.ok(/class="option-key"[^>]*>3<[\s\S]*?Other \(write your own\)/.test(html));
    assert.ok(html.includes('type="radio"'));
    assert.ok(html.includes('Answer'));
    assert.ok(html.includes('Press 1–3 to choose, Enter to answer'));
    assert.ok(!html.includes('Always allow'));
  });

  test('承認待ちの間は、入力欄の代わりに待っている旨を出す', () => {
    const html = render(
      <App
        state={state({
          pending: { id: 'req-1', toolName: 'Edit', input: {}, suggestions: [] },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('Waiting for your input'));
  });

  test('decision メッセージの型が protocol にある', () => {
    const message: ToExtension = {
      type: 'decision',
      requestId: 'req-1',
      decision: { behavior: 'allow' },
    };
    assert.strictEqual(message.type, 'decision');
  });
});
