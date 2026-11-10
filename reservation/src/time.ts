// 日本時間（JST, UTC+9・夏時間なし）の日付と時刻を扱う小さな関数群。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface JstNow {
  date: string; // YYYY-MM-DD
  min: number; // 0時からの分数
}

export function jstNow(nowMs: number = Date.now()): JstNow {
  const d = new Date(nowMs + JST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    min: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** 0=日曜 … 6=土曜 */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "18:30" → 1110 */
export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 29 || min > 59) return null; // 深夜営業向けに 29:59 まで許す
  return h * 60 + min;
}

/** 1110 → "18:30" */
export function formatTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** 予約日時までの分数（過去ならマイナス） */
export function minutesUntil(now: JstNow, date: string, startMin: number): number {
  return daysBetween(now.date, date) * 1440 + startMin - now.min;
}
