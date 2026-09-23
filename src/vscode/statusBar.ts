import * as vscode from 'vscode';
import type { TaskService } from '../app/taskService';

/** ステータスバーに、実行中と入力待ちの件数を出す。クリックでタスクの一覧を開く */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions: (() => void)[] = [];

  constructor(private readonly service: TaskService) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.name = 'Foreman';
    this.item.command = 'workbench.view.extension.foreman';
    this.subscriptions.push(
      service.onDidChange(() => void this.refresh()),
      service.onDidDelete(() => void this.refresh())
    );
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const tasks = await this.service.list();
    const running = tasks.filter((t) => t.status === 'running').length;
    const waiting = tasks.filter((t) => t.status === 'waiting').length;
    if (running === 0 && waiting === 0) {
      this.item.hide();
      return;
    }
    const parts: string[] = [];
    if (running > 0) {
      parts.push(`$(sync~spin) ${running}`);
    }
    if (waiting > 0) {
      parts.push(`$(bell) ${waiting}`);
    }
    this.item.text = parts.join(' ');
    this.item.tooltip = vscode.l10n.t(
      'Foreman: {0} running, {1} waiting for input',
      String(running),
      String(waiting)
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
