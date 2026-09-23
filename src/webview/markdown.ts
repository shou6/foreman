import { Marked, type Tokens } from 'marked';

/** 許すリンクの scheme。javascript: などは無効にする */
const SAFE_LINK = /^(https?:|mailto:|vscode:|command:)/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Claude の出力に含まれる生の HTML は描画せず、文字として見せる
    html({ text }: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(text);
    },
    link({ href, title, tokens }: Tokens.Link): string {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_LINK.test(href)) {
        return label;
      }
      const titleAttr =
        title === null || title === undefined ? '' : ` title="${escapeHtml(title)}"`;
      return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener">${label}</a>`;
    },
  },
});

/** Claude の出力（Markdown）を、タスク画面に出す HTML にする */
export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false });
}
