import * as vscode from 'vscode';
import type { RateLimitService } from '../app/rateLimitService';
import type { TaskService } from '../app/taskService';
import { statusBarView, type StatusBarItemView } from '../domain/statusBarView';
import { readSettings } from './settings';

/**
 * ステータスバーの左側での並びの優先度。VS Code の「問題」（エラーと警告の数）は 50 で、
 * 同じ値だと並びが id のハッシュで決まり、2 つの項目の間に「問題」が入ることがあった。
 * 2 つとも 50 より大きくし、「問題」の左に並べて出す
 */
const PRIORITY = 51;

/**
 * ステータスバーに、Foreman の項目（今見ているタスクと実行中の件数）と、Claude の契約の利用枠の項目を出す。
 * どちらもクリックでタスクの一覧を開く（サイドバーに利用枠の詳細がある）
 */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly claudeItem: vscode.StatusBarItem;
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
    // id を分ける。省略すると両方が拡張機能の ID になり、右クリックのメニューで 1 つにまとまって一緒に隠れる
    this.item = vscode.window.createStatusBarItem(
      'foreman.tasks',
      vscode.StatusBarAlignment.Left,
      PRIORITY + 1
    );
    this.item.name = 'Foreman';
    this.item.command = 'workbench.view.extension.foreman';
    // Foreman の項目のすぐ右に並べる
    this.claudeItem = vscode.window.createStatusBarItem(
      'foreman.planUsage',
      vscode.StatusBarAlignment.Left,
      PRIORITY
    );
    this.claudeItem.name = vscode.l10n.t('Claude Plan Usage');
    this.claudeItem.command = 'workbench.view.extension.foreman';
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
    const planUsage = readSettings().planUsage;
    const view = statusBarView(
      {
        tasks: await this.service.list(),
        activeId: this.active.id(),
        // 出さない設定の時は、取得済みの値があっても出さない（ツールチップにも）
        limits: planUsage.showInStatusBar ? this.rateLimits?.current() : undefined,
        planUsageItems: planUsage.statusBar,
      },
      vscode.l10n.t
    );
    show(this.item, view.foreman);
    show(this.claudeItem, view.claude);
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.item.dispose();
    this.claudeItem.dispose();
  }
}

function show(item: vscode.StatusBarItem, view: StatusBarItemView | undefined): void {
  if (view === undefined) {
    item.hide();
    return;
  }
  item.text = view.text;
  item.tooltip = view.tooltip;
  item.show();
}
