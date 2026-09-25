import type { SidebarBadge, SidebarGroup, SidebarGroupKey, SidebarItem } from '../domain/sidebar';
import type { PlanUsageItem, RateLimits } from '../domain/rateLimits';
import type { Ago } from '../domain/time';

export type { SidebarBadge, SidebarGroup, SidebarGroupKey, SidebarItem };

/** 左サイドバーに出す文字列。翻訳は拡張機能側で済ませて渡す */
export interface SidebarStrings {
  newTask: string;
  empty: string;
  groups: Record<SidebarGroupKey, string>;
  badges: Record<'approval' | 'question' | 'replied' | 'failed' | 'interrupted' | 'draft', string>;
  /** {0} に分数 */
  minutes: string;
  /** {0} にファイル数 */
  files: string;
  /** 完了した時刻からの経過。{0} に数 */
  ago: Record<Ago['unit'], string>;
  /** 下端の今日のトークンの見出し */
  today: string;
  /** 下端の利用枠 */
  rateLimits: {
    title: string;
    fiveHour: string;
    sevenDay: string;
    /** {0} に回復までの時間 */
    resetsIn: string;
    /** 回復までの時間の表し方。{0} に時間、{1} に分 / {0} に分 */
    hoursMinutes: string;
    minutes: string;
    /** {0} に取得した時刻 */
    fetchedAt: string;
  };
}

export interface SidebarState {
  groups: SidebarGroup[];
  /** 今見ているタスク（前面のタスク画面） */
  activeTaskId?: string;
  /** 今日のトークンの合計（全タスク） */
  today: number;
  /** 契約の利用枠。取得する前と、契約の枠が無い時は undefined */
  rateLimits?: RateLimits;
  /** 利用枠のうち出す項目（設定 foreman.planUsage.sidebar）。無ければすべて */
  planUsageItems?: PlanUsageItem[];
  /** 今の時刻（ISO）。回復までの時間の計算に使う */
  now?: string;
  strings: SidebarStrings;
}

/** 拡張機能 → 左サイドバー */
export type ToSidebar = { type: 'state'; state: SidebarState };

/** 左サイドバー → 拡張機能 */
export type FromSidebar = { type: 'ready' } | { type: 'open'; id: string } | { type: 'newTask' };
