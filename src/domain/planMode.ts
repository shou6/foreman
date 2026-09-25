import type { PermissionDecision } from './events';
import type { PermissionMode } from './task';

/**
 * 承認の結果で承認方式が変わる時の、次の方式。
 * ExitPlanMode（計画の承認）を許可するとプランモードを抜ける。SDK の提案に編集の自動許可があれば acceptEdits。
 * EnterPlanMode を許可するとプランモードに入る。拒否やほかのツールでは変わらない
 */
export function modeAfterDecision(
  mode: PermissionMode,
  toolName: string,
  decision: PermissionDecision
): PermissionMode {
  if (decision.behavior === 'deny') {
    return mode;
  }
  if (toolName === 'ExitPlanMode') {
    const acceptEdits =
      decision.behavior === 'allow-always' &&
      decision.permissions.some((p) => p.type === 'setMode' && p.mode === 'acceptEdits');
    return acceptEdits ? 'acceptEdits' : 'default';
  }
  if (toolName === 'EnterPlanMode') {
    return 'plan';
  }
  return mode;
}
