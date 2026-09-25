import * as assert from 'assert';
import { render } from 'preact-render-to-string';
import { App } from '../../../webview/App';
import { Scroll } from '../../../webview/Scroll';
import { diffKey, type PanelState } from '../../../webview/protocol';
import { PANEL_STRINGS } from '../../support/panelStrings';

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
    models: [],
    maxWidthEm: 72,
    toolCallsExpanded: true,
    presets: [],
    context: { cwd: 'D:\\w', permissionMode: 'default', alwaysAllowed: [] },
    strings: PANEL_STRINGS,
    ...overrides,
  };
}

suite('webview: 内側に重ねるスクロールバー', () => {
  test('Scroll は、外枠の div（scroll と指定の class）の中に、スクロールする要素を置く', () => {
    const html = render(
      <Scroll class="tool-output-scroll" as="pre" viewportClass="tool-output">
        done
      </Scroll>
    );
    assert.strictEqual(
      html,
      '<div class="scroll tool-output-scroll"><pre class="tool-output">done</pre></div>'
    );
  });

  test('ツールの出力は Scroll の中に出す', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            {
              kind: 'tool',
              turn: 0,
              id: 't1',
              name: 'Bash',
              input: { command: 'ls' },
              status: 'ok',
              output: 'done',
            },
          ],
        })}
        post={() => {}}
      />
    );
    assert.ok(
      html.includes('<div class="scroll tool-output-scroll"><pre class="tool-output">done</pre>')
    );
  });

  test('差分の行は Scroll の中に出す', () => {
    const html = render(
      <App
        state={state({
          items: [
            { kind: 'prompt', turn: 0, text: 'p' },
            { kind: 'turn-end', turn: 0, ok: true },
          ],
          changes: {
            0: [
              {
                path: 'src/a.ts',
                kind: 'modified',
                before: 'h1',
                after: 'h2',
                source: 'edit-tool',
                reverted: false,
              },
            ],
          },
          diffs: { [diffKey(0, 'src/a.ts')]: [{ kind: 'add', text: 'x' }] },
        })}
        post={() => {}}
      />
    );
    assert.ok(html.includes('<div class="scroll diff-scroll"><pre class="diff-lines">'));
  });

  test('Context パネルの「次に送る内容」は Scroll の中に出す', () => {
    const html = render(<App state={state({})} post={() => {}} initialDraft="hello" />);
    assert.ok(
      html.includes('<div class="scroll context-preview-scroll"><pre class="context-preview">hello')
    );
  });

  test('承認カードの計画と入力の JSON は Scroll の中に出す', () => {
    const html = render(
      <App
        state={state({
          status: 'waiting',
          turnOpen: true,
          pending: {
            id: 'req-1',
            toolName: 'ExitPlanMode',
            input: { plan: '# Plan' },
            suggestions: [],
          },
        })}
        post={() => {}}
      />
    );
    assert.ok(
      html.includes('<div class="scroll approval-plan-scroll"><div class="approval-plan markdown">')
    );
    assert.ok(html.includes('<div class="scroll approval-input-scroll"><pre>{'));
  });

  test('指示の吹き出しのコードブロックは Scroll の中に出す', () => {
    const html = render(
      <App
        state={state({ items: [{ kind: 'prompt', turn: 0, text: '```ts\nconst a = 1;\n```' }] })}
        post={() => {}}
      />
    );
    assert.ok(
      html.includes(
        '<div class="scroll prompt-code-scroll"><pre><code data-lang="ts">const a = 1;</code></pre></div>'
      )
    );
  });
});
