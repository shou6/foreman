/** 添付したファイルのパスを指示の後ろに列挙する（FR-VIEW-5）。重複は 1 つにまとめる */
export function promptWithAttachments(prompt: string, attachments: readonly string[]): string {
  const unique = [...new Set(attachments)];
  if (unique.length === 0) {
    return prompt;
  }
  return prompt + '\n\nAttached files:\n' + unique.map((p) => '- ' + p).join('\n');
}
