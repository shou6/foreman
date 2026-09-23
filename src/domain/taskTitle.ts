/** タイトルの最大の長さ（コードポイント数） */
const MAX_TITLE_LENGTH = 50;

/**
 * 指示の先頭からタスクのタイトルを作る。
 * 最初の空でない行を使い、長ければ 50 文字で切って「…」を付ける。
 * 空の指示からは作れないので undefined を返す。表示側で l10n の既定名を当てる
 */
export function titleFromPrompt(prompt: string): string | undefined {
  const firstLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) {
    return undefined;
  }
  // サロゲートペアを壊さないよう、コードポイント単位で数える
  const chars = Array.from(firstLine);
  if (chars.length <= MAX_TITLE_LENGTH) {
    return firstLine;
  }
  return chars.slice(0, MAX_TITLE_LENGTH).join('') + '…';
}
