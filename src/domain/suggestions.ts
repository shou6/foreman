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
