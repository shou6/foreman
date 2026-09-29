/**
 * SDK が「常に許可」として提案してきた内容を、人が読める 1 行ずつにする。
 * setMode は mode 名、addRules は Bash(内容) のようにツール名と内容、それ以外は JSON
 */
export function describeSuggestions(suggestions: readonly Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const s of suggestions) {
    if (s.type === 'setMode' && typeof s.mode === 'string') {
      out.push(s.mode);
    } else if (s.type === 'addRules' && Array.isArray(s.rules)) {
      for (const r of s.rules) {
        const rule = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {};
        if (typeof rule.toolName === 'string') {
          out.push(
            typeof rule.ruleContent === 'string'
              ? `${rule.toolName}(${rule.ruleContent})`
              : rule.toolName
          );
        }
      }
    } else {
      out.push(JSON.stringify(s));
    }
  }
  return out;
}

/** 複数のコマンドをつなぐ、リダイレクトする、コマンドを埋め込む記号 */
const COMPOUND = /&&|\|\||[;|<>`\n]|\$\(/;
/** 2 語目をサブコマンドとみなす形（オプション、パス、引用符、ファイル名は含めない） */
const SUBCOMMAND = /^[A-Za-z][\w-]*$/;

/**
 * Bash の規則の内容を、コマンド名（とサブコマンド）の接頭辞に広げる。
 * git commit -q -m '…' は git commit *、node /tmp/a.js は node *。広げられない形は undefined
 */
function broadenBashRule(content: string): string | undefined {
  const command = content.replace(/(:\*|\s\*)$/, '').trim();
  if (command === '' || COMPOUND.test(command)) {
    return undefined;
  }
  const [name = '', second] = command.split(/\s+/);
  if (name.includes('=')) {
    return undefined;
  }
  return second !== undefined && SUBCOMMAND.test(second) ? `${name} ${second} *` : `${name} *`;
}

/**
 * SDK が「常に許可」として提案してきた内容のうち、Bash の規則をコマンド名の接頭辞に広げる。
 * CLI の提案はコマンド全体（コミットのメッセージまで）になることがあり、同じ種類のコマンドでも毎回聞かれるため。
 * 広げて同じになった規則は 1 つにまとめる。Bash 以外や setMode はそのまま
 */
export function broadenSuggestions(
  suggestions: readonly Record<string, unknown>[]
): Record<string, unknown>[] {
  return suggestions.map((s) => {
    if (s.type !== 'addRules' || !Array.isArray(s.rules)) {
      return s;
    }
    const seen = new Set<string>();
    const rules: unknown[] = [];
    for (const r of s.rules) {
      const rule = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : undefined;
      const broadened =
        rule?.toolName === 'Bash' && typeof rule.ruleContent === 'string'
          ? broadenBashRule(rule.ruleContent)
          : undefined;
      const next = broadened === undefined ? r : { ...rule, ruleContent: broadened };
      const key = JSON.stringify(next);
      if (!seen.has(key)) {
        seen.add(key);
        rules.push(next);
      }
    }
    return { ...s, rules };
  });
}
