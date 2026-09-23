import type { Task } from './task';
import type { Attachment } from './attachments';
import type { TranscriptItem } from './transcript';

/** ツールの出力をエクスポートに含める上限（文字数） */
const MAX_OUTPUT = 2000;

/**
 * タスクを Markdown に書き出す（FR-TASK-13）。
 * 人が読んで共有する用途なので、ツールの出力は折りたたみに入れ、長ければ切る
 */
export function exportTaskMarkdown(task: Task, items: readonly TranscriptItem[]): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`, '');
  lines.push(`- Status: ${task.status}`);
  lines.push(
    `- Model: ${task.model ?? '(default)'}` +
      (task.activeModel !== undefined && task.activeModel !== task.model
        ? ` (active: ${task.activeModel})`
        : '')
  );
  if (task.worktree !== undefined) {
    lines.push(`- Worktree: ${task.worktree.branch} (base: ${task.worktree.base})`);
  }
  lines.push(`- Directory: ${task.cwd}`);
  lines.push(`- Created: ${task.createdAt}`);
  lines.push(`- Updated: ${task.updatedAt}`);
  lines.push(`- Task ID: ${task.id}`);
  if (task.sessionId !== undefined) {
    lines.push(`- Session ID: ${task.sessionId}`);
  }
  lines.push('');

  for (const turn of task.turns) {
    lines.push(`## Turn ${turn.index + 1}`, '');
    lines.push(
      `- Started: ${turn.startedAt}` +
        (turn.endedAt !== undefined ? ` / Ended: ${turn.endedAt}` : '')
    );
    if (turn.attachments.length > 0) {
      lines.push(
        `- Attachments: ${turn.attachments.map((a) => `\`${attachmentLabel(a)}\``).join(', ')}`
      );
    }
    lines.push('');
    lines.push(quote(turn.prompt), '');
    // ツールの呼び出しは続く限り 1 つの箇条書きにまとめ、前後を空行で区切る
    let inTools = false;
    for (const item of items.filter((i) => i.turn === turn.index)) {
      if (item.kind !== 'tool' && inTools) {
        lines.push('');
        inTools = false;
      }
      switch (item.kind) {
        case 'text':
          lines.push(demote(item.text), '');
          break;
        case 'tool':
          inTools = true;
          lines.push(`- ${mark(item.status)} ${item.name} \`${summarize(item.input)}\``);
          if (item.output !== undefined && item.output.trim() !== '') {
            lines.push('', '  <details>', '  <summary>output</summary>', '', '  ```text');
            lines.push(
              ...truncate(item.output)
                .replace(/\n+$/, '')
                .split('\n')
                .map((l) => '  ' + l)
            );
            lines.push('  ```', '', '  </details>', '');
          }
          break;
        default:
          break;
      }
    }
    if (inTools) {
      lines.push('');
    }
    if (turn.changes.length > 0) {
      lines.push('', '### Changes', '');
      for (const c of turn.changes) {
        const counts =
          c.added !== undefined && c.removed !== undefined
            ? ` +${c.added} -${c.removed}`
            : ' (previous content unknown)';
        lines.push(
          `- ${c.kind === 'created' ? 'A' : c.kind === 'deleted' ? 'D' : 'M'} \`${c.path}\`${counts}` +
            (c.reverted ? ' (reverted)' : '')
        );
      }
    }
    lines.push('');
    if (turn.result !== undefined) {
      if (turn.result.ok) {
        const u = turn.result.usage;
        lines.push(
          'Result: ok' +
            (u !== undefined
              ? ` (in=${u.inputTokens} cacheRead=${u.cacheReadInputTokens} cacheWrite=${u.cacheCreationInputTokens} out=${u.outputTokens})`
              : '')
        );
      } else {
        lines.push(`Result: failed (${turn.result.reason})`);
      }
      lines.push('');
    }
  }
  return (
    lines
      .join('\n')
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

function mark(status: 'running' | 'ok' | 'error'): string {
  return status === 'ok' ? '✓' : status === 'error' ? '✗' : '…';
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((l) => '> ' + l)
    .join('\n');
}

/**
 * Claude の出力の見出しを 2 段下げ、文書の見出し（# と ##）とぶつからないようにする。
 * 見出し・箇条書き・コードブロックの前後に空行を入れ、markdownlint に通る形にする
 */
function demote(text: string): string {
  const out: string[] = [];
  let inFence = false;
  const src = text.replace(/\n+$/, '').split('\n');
  for (let i = 0; i < src.length; i++) {
    const raw = src[i] ?? '';
    const line = /^#{1,4} /.test(raw) && !inFence ? '##' + raw : raw;
    const prev = out[out.length - 1];
    const startsBlock =
      !inFence &&
      (/^#{1,6} /.test(line) ||
        /^```/.test(line) ||
        (/^([-*+]|\d+\.) /.test(line) && !(prev !== undefined && /^([-*+]|\d+\.|\s) /.test(prev))));
    if (startsBlock && prev !== undefined && prev !== '') {
      out.push('');
    }
    out.push(line);
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (!inFence) {
        const next = src[i + 1];
        if (next !== undefined && next !== '') {
          out.push('');
        }
      }
    } else if (/^#{1,6} /.test(line)) {
      const next = src[i + 1];
      if (next !== undefined && next !== '') {
        out.push('');
      }
    } else if (/^([-*+]|\d+\.) /.test(line) && !inFence) {
      const next = src[i + 1];
      if (next !== undefined && next !== '' && !/^([-*+]|\d+\.|\s) /.test(next)) {
        out.push('');
      }
    }
  }
  return out.join('\n');
}

function truncate(text: string): string {
  return text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + '\n(truncated)' : text;
}

function summarize(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'pattern', 'path', 'url', 'skill']) {
    const value = input[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  const json = JSON.stringify(input);
  return json.length > 80 ? json.slice(0, 80) + '…' : json;
}

/** 添付を 1 語で表す（書き出し用） */
function attachmentLabel(a: Attachment): string {
  switch (a.kind) {
    case 'file':
      return a.path;
    case 'selection':
      return `${a.path}:${a.startLine}-${a.endLine}`;
    case 'diagnostics':
      return `diagnostics (${a.count})`;
    case 'gitDiff':
      return `git diff (${a.files} files)`;
  }
}
