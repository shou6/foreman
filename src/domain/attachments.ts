/** 指示に添えるもの（FR-VIEW-5、11、12）。ファイル、エディタの選択範囲、診断、git diff */
export type Attachment =
  | { kind: 'file'; path: string }
  | { kind: 'selection'; path: string; startLine: number; endLine: number; text: string }
  | { kind: 'diagnostics'; count: number; text: string }
  | { kind: 'gitDiff'; files: number; text: string };

/** 同じものを 1 つに数えるための鍵。診断と git diff は 1 つだけ持てる */
export function attachmentKey(attachment: Attachment): string {
  switch (attachment.kind) {
    case 'file':
      return 'file:' + attachment.path;
    case 'selection':
      return `selection:${attachment.path}:${attachment.startLine}-${attachment.endLine}`;
    case 'diagnostics':
      return 'diagnostics';
    case 'gitDiff':
      return 'gitDiff';
  }
}

/** 保存済みの添付を読む。古い形（パスの文字列）はファイルとして扱い、知らない形は捨てる */
export function normalizeAttachments(list: readonly unknown[]): Attachment[] {
  const result: Attachment[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      result.push({ kind: 'file', path: item });
    } else if (typeof item === 'object' && item !== null && 'kind' in item) {
      result.push(item as Attachment);
    }
  }
  return result;
}

/** 重複を鍵で除く。後から足したものは残さない */
export function uniqueAttachments(list: readonly Attachment[]): Attachment[] {
  const seen = new Set<string>();
  const result: Attachment[] = [];
  for (const item of list) {
    const key = attachmentKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/** 添付を指示の後ろに添える。ファイルはパスの列挙、それ以外は本文を見出し付きで添える */
export function promptWithAttachments(prompt: string, attachments: readonly Attachment[]): string {
  const unique = uniqueAttachments(attachments);
  const files = unique.filter((a): a is Attachment & { kind: 'file' } => a.kind === 'file');
  const parts: string[] = [];
  if (files.length > 0) {
    parts.push('Attached files:\n' + files.map((f) => '- ' + f.path).join('\n'));
  }
  for (const a of unique) {
    switch (a.kind) {
      case 'selection':
        parts.push(
          `Selected code (${a.path}:${a.startLine}-${a.endLine}):\n\`\`\`\n${a.text}\n\`\`\``
        );
        break;
      case 'diagnostics':
        parts.push(`Diagnostics (${a.count}):\n${a.text}`);
        break;
      case 'gitDiff':
        parts.push(`Uncommitted git diff (${a.files} files):\n\`\`\`diff\n${a.text}\n\`\`\``);
        break;
      default:
        break;
    }
  }
  return parts.length === 0 ? prompt : prompt + '\n\n' + parts.join('\n\n');
}
