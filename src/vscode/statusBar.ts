import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';
import { statusCounts } from '../domain/statusCounts';
import { contextUsage, formatTokens } from '../domain/usage';

/** ステータスバーに、実行中と「あなたの番」の件数を出す。クリックでタスクの一覧を開く */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions: (() => void)[] = [];

  constructor(
    private readonly service: TaskService,
    private readonly active: {
      id: () => string | undefined;
      onDidChange: (l: () => void) => vscode.Disposable;
    } = {
      id: () => undefined,
      onDidChange: () => ({ dispose: () => {} }),
    }
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.name = 'Foreman';
    this.item.command = 'workbench.view.extension.foreman';
    const activeSubscription = active.onDidChange(() => void this.refresh());
    this.subscriptions.push(
      () => activeSubscription.dispose(),
      service.onDidChange(() => void this.refresh()),
      service.onDidDelete(() => void this.refresh())
    );
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const tasks = await this.service.list();
    const { running, yourTurn } = statusCounts(tasks);
    const active = tasks.find((t) => t.id === this.active.id());
    if (running === 0 && yourTurn === 0 && active === undefined) {
      this.item.hide();
      return;
    }
    const parts: string[] = [];
    if (active !== undefined) {
      const model = active.activeModel ?? active.model;
      const usage = contextUsage(active);
      const context =
        usage === undefined
          ? undefined
          : usage.ratio === undefined
            ? formatTokens(usage.used)
            : `${Math.round(usage.ratio * 100)}%`;
      const detail = [model, context].filter((v) => v !== undefined).join(' ');
      if (detail !== '') {
        parts.push(`$(tasklist) ${detail}`);
      }
    }
    if (running > 0) {
      parts.push(vscode.l10n.t('$(sync~spin) {0} running', String(running)));
    }
    if (yourTurn > 0) {
      parts.push(vscode.l10n.t('$(bell) {0} your turn', String(yourTurn)));
    }
    this.item.text = 'Foreman: ' + parts.join(' · ');
    this.item.tooltip = vscode.l10n.t(
      'Foreman: {0} running, {1} waiting for you',
      String(running),
      String(yourTurn)
    );
    this.item.show();
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.item.dispose();
  }
}
