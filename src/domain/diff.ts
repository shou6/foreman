import { diffLines } from 'diff';

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

/** 行単位の差分。無いファイル（新規作成・削除）は undefined で渡す */
export function lineDiff(before: string | undefined, after: string | undefined): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const part of diffLines(normalize(before), normalize(after))) {
    const kind: DiffLine['kind'] = part.added ? 'add' : part.removed ? 'del' : 'same';
    for (const text of splitLines(part.value)) {
      lines.push({ kind, text });
    }
  }
  return lines;
}

export function countChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'add') {
      added++;
    } else if (line.kind === 'del') {
      removed++;
    }
  }
  return { added, removed };
}

/** 末尾の改行で空行を作らないように分ける */
function splitLines(value: string): string[] {
  const parts = value.split(/\r?\n/);
  if (parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts;
}

/** 末尾の改行の有無で行が違うと見なされないよう、空でなければ改行で終わらせる */
function normalize(content: string | undefined): string {
  if (content === undefined || content === '') {
    return '';
  }
  return content.endsWith('\n') ? content : content + '\n';
}

export interface NumberedLine extends DiffLine {
  oldNo: number | undefined;
  newNo: number | undefined;
}

/** 差分の各行に、変更前と変更後の行番号を付ける（インライン差分の表示用） */
export function numberLines(lines: readonly DiffLine[]): NumberedLine[] {
  let oldNo = 0;
  let newNo = 0;
  return lines.map((line) => {
    if (line.kind === 'same') {
      oldNo++;
      newNo++;
      return { ...line, oldNo, newNo };
    }
    if (line.kind === 'del') {
      oldNo++;
      return { ...line, oldNo, newNo: undefined };
    }
    newNo++;
    return { ...line, oldNo: undefined, newNo };
  });
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: NumberedLine[];
}

/**
 * 変更の前後 context 行だけを残して hunk に分ける（git diff と同じ見せ方）。
 * 近い変更（間の同じ行が context の 2 倍以下）は 1 つの hunk にまとめる
 */
export function hunksOf(lines: readonly DiffLine[], context: number): Hunk[] {
  const numbered = numberLines(lines);
  const changed = numbered.map((l) => l.kind !== 'same');
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < numbered.length) {
    if (!changed[i]) {
      i++;
      continue;
    }
    const start = Math.max(0, i - context);
    let end = i;
    let j = i;
    while (j < numbered.length) {
      if (changed[j]) {
        end = j;
        j++;
        continue;
      }
      // 次の変更が context * 2 以内なら同じ hunk に含める
      let k = j;
      while (k < numbered.length && !changed[k] && k - j < context * 2) {
        k++;
      }
      if (k < numbered.length && changed[k] && k - j <= context * 2) {
        j = k;
        continue;
      }
      break;
    }
    const stop = Math.min(numbered.length, end + context + 1);
    const slice = numbered.slice(start, stop);
    const olds = slice.filter((l) => l.oldNo !== undefined);
    const news = slice.filter((l) => l.newNo !== undefined);
    hunks.push({
      oldStart: olds[0]?.oldNo ?? numbered[start]?.oldNo ?? 1,
      oldCount: olds.length,
      newStart: news[0]?.newNo ?? numbered[start]?.newNo ?? 1,
      newCount: news.length,
      lines: slice,
    });
    i = stop;
  }
  return hunks;
}
