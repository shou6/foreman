/** ある時刻から今までの経過。表し方（「10分前」など）は画面の側で決める */
export interface Ago {
  unit: 'now' | 'minutes' | 'hours' | 'yesterday' | 'days';
  value: number;
}

/** 1 分未満は now、1 時間未満は分、1 日未満は時間、1 日は昨日、それより前は日数 */
export function agoOf(then: string, now: string): Ago {
  const ms = Date.parse(now) - Date.parse(then);
  if (!Number.isFinite(ms) || ms < 60_000) {
    return { unit: 'now', value: 0 };
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return { unit: 'minutes', value: minutes };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { unit: 'hours', value: hours };
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? { unit: 'yesterday', value: 1 } : { unit: 'days', value: days };
}

/** 経過ミリ秒を分と秒に分ける（切り捨て、負は 0） */
export function splitElapsed(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** 手元の時刻（タイムゾーン）で同じ日か */
export function sameLocalDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** 今日・昨日・それより前（手元の時刻の日付で） */
export function dayKindOf(iso: string, now: Date): 'today' | 'yesterday' | 'other' {
  const day = new Date(iso).toDateString();
  if (day === now.toDateString()) {
    return 'today';
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return day === yesterday.toDateString() ? 'yesterday' : 'other';
}

/** 日付（月・日・曜日）。今と年が違えば年も付ける */
export function formatDate(iso: string, locale: string, now: Date): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

/** 時刻（24 時間制の時と分、2 桁） */
export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}
