import * as vscode from 'vscode';
import type { PermissionDecision, PermissionRequest } from '../domain/events';

/**
 * ツールの承認を通知で求める。M3 でタスク画面の承認カードに置き換える。
 * それまでは、通知を閉じた時は拒否として扱う
 */
export async function askPermission(
  title: string,
  request: PermissionRequest
): Promise<PermissionDecision> {
  const allow = vscode.l10n.t('Allow');
  const always = vscode.l10n.t('Always allow in this task');
  const deny = vscode.l10n.t('Deny');
  const target = summarize(request.input);
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t('{0}: allow {1}? {2}', title, request.toolName, target),
    { modal: false },
    allow,
    always,
    deny
  );
  if (choice === allow) {
    return { behavior: 'allow' };
  }
  if (choice === always) {
    return { behavior: 'allow-always', permissions: request.suggestions };
  }
  return { behavior: 'deny', message: vscode.l10n.t('Denied by the user in Foreman.') };
}

function summarize(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'pattern', 'url']) {
    const value = input[key];
    if (typeof value === 'string') {
      return value.length > 120 ? value.slice(0, 120) + '…' : value;
    }
  }
  return '';
}
