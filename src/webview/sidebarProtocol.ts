import type { SidebarBadge, SidebarGroup, SidebarGroupKey, SidebarItem } from '../domain/sidebar';
import type { ContextUsage } from '../domain/usage';

export type { SidebarBadge, SidebarGroup, SidebarGroupKey, SidebarItem };

/** 左サイドバーに出す文字列。翻訳は拡張機能側で済ませて渡す */
export interface SidebarStrings {
  newTask: string;
  empty: string;
  groups: Record<SidebarGroupKey, string>;
  badges: Record<'approval' | 'replied' | 'failed' | 'interrupted' | 'done' | 'draft', string>;
  /** {0} に分数 */
  minutes: string;
  /** {0} にファイル数 */
  files: string;
  /** 下端のコンテキストの見出し */
  context: string;
  /** 下端の今日のトークンの見出し */
  today: string;
}

export interface SidebarState {
  groups: SidebarGroup[];
  /** 今見ているタスク（前面のタスク画面） */
  activeTaskId?: string;
  /** 今見ているタスクのコンテキストの使用量 */
  context?: ContextUsage;
  /** 今日のトークンの合計（全タスク） */
  today: number;
  strings: SidebarStrings;
}

/** 拡張機能 → 左サイドバー */
export type ToSidebar = { type: 'state'; state: SidebarState };

/** 左サイドバー → 拡張機能 */
export type FromSidebar = { type: 'ready' } | { type: 'open'; id: string } | { type: 'newTask' };
