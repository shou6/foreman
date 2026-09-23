import type { Task } from './task';

/**
 * 再開時に Claude へ送る指示（FR-TASK-8 の補い）。
 * 中断したターンの指示は Claude Code の会話に残っていないことがあるので、直前の指示を添える
 */
export function resumePrompt(task: Task, prompt: string): string {
  const last = task.turns[task.turns.length - 1];
  if (task.status !== 'interrupted' || last === undefined) {
    return prompt;
  }
  return (
    `The previous instruction was interrupted before it finished: "${last.prompt}". ` +
    'Continue from there if it still applies.\n\n' +
    prompt
  );
}
