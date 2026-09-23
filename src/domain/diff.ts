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
