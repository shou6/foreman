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
