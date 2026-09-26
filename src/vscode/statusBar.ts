import * as vscode from 'vscode';
import type { RateLimitService } from '../app/rateLimitService';
import type { TaskService } from '../app/taskService';
import { planUsageEntries } from '../domain/rateLimits';
import { statusCounts } from '../domain/statusCounts';
import { readSettings } from './settings';
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
    },
    /** 契約の利用枠。無ければ出さない */
    private readonly rateLimits?: RateLimitService
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.name = 'Foreman';
    this.item.command = 'workbench.view.extension.foreman';
    const activeSubscription = active.onDidChange(() => void this.refresh());
    const limitsSubscription = rateLimits?.onDidChange(() => void this.refresh());
    this.subscriptions.push(
      () => activeSubscription.dispose(),
      () => limitsSubscription?.(),
      service.onDidChange(() => void this.refresh()),
      service.onDidDelete(() => void this.refresh())
    );
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const tasks = await this.service.list();
    const { running, yourTurn } = statusCounts(tasks);
    const active = tasks.find((t) => t.id === this.active.id());
    const planUsage = readSettings().planUsage;
    // 出さない設定の時は、取得済みの値があっても出さない（ツールチップにも）
    const limits = planUsage.showInStatusBar ? this.rateLimits?.current() : undefined;
    // 契約の利用枠は、設定で選んだ項目を「5h 22% · 7d 45% · Fable 73%」のように短く出す
    const entries = limits === undefined ? [] : planUsageEntries(limits, planUsage.statusBar);
    if (running === 0 && yourTurn === 0 && active === undefined && entries.length === 0) {
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
    if (entries.length > 0) {
      const short = entries.map((e) =>
        e.kind === 'fiveHour'
          ? vscode.l10n.t('5h {0}%', String(e.utilization))
          : e.kind === 'sevenDay'
            ? vscode.l10n.t('7d {0}%', String(e.utilization))
            : `${e.name ?? ''} ${e.utilization}%`
      );
      parts.push(`$(pulse) ${short.join(' · ')}`);
    }
    this.item.text = 'Foreman: ' + parts.join(' · ');
    const lines = [
      vscode.l10n.t('Foreman: {0} running, {1} waiting for you', String(running), String(yourTurn)),
    ];
    if (limits !== undefined) {
      lines.push(
        vscode.l10n.t(
          'Plan usage: 5-hour {0}%, 7-day {1}%',
          String(limits.fiveHour?.utilization ?? '-'),
          String(limits.sevenDay?.utilization ?? '-')
        )
      );
      for (const model of limits.models) {
        lines.push(`${model.name}: ${model.utilization}%`);
      }
    }
    this.item.tooltip = lines.join('\n');
    this.item.show();
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.item.dispose();
  }
}
