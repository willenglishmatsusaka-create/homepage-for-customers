// 空き枠の計算。D1 に依存しない純粋な関数だけを置き、テストしやすくする。
//
// 在庫の考え方（MVP）
// - 席は「席の種類（カウンター／テーブル）」ごとの席数で管理し、個々の席は割り当てない。
// - ある時間帯に予約を入れられるのは「その時間帯と重なる予約の人数の合計 ＋ 今回の人数 ≤ 席数」のとき。
//   重なる予約を単純に足すので、厳密な同時在席数より少し慎重になる。
//   保存時の SQL（repo.ts）も同じ式で確かめるため、表示と保存の結果が食い違わない。
// - ネット予約は、さらに「ネット予約の人数の合計 ≤ ネット予約に出す席数」を満たす必要がある。

import { type JstNow, daysBetween, minutesUntil, weekday } from "./time";

export type Mode = "web" | "staff";
export type Source = "web" | "phone" | "walkin" | "tablecheck" | "ikyu" | "tabelog" | "other";
export type Status = "confirmed" | "seated" | "done" | "cancelled" | "no_show";

export const ACTIVE_STATUSES: readonly Status[] = ["confirmed", "seated"];

export interface Policy {
  bookingWindowDays: number; // 何日先まで受け付けるか
  cutoffMinutes: number; // 入店の何分前で締め切るか
  maxPartyOnline: number; // ネット予約の人数上限（超える場合は電話）
}

export const DEFAULT_POLICY: Policy = { bookingWindowDays: 60, cutoffMinutes: 1440, maxPartyOnline: 6 };

export interface SeatGroup {
  id: string;
  capacity: number;
  onlineCapacity: number;
  minParty: number;
  maxParty: number;
  sort: number;
}

export interface Period {
  id: string;
  weekdays: number; // 日=1, 月=2 … 土=64
  startTimes: number[];
  lastEntry: number;
  duration: number;
  sort: number;
}

export interface Course {
  id: string;
  duration: number | null;
  minParty: number;
  maxParty: number;
  dailyLimit: number | null;
  periodIds: string[];
  online: boolean;
}

export interface Override {
  date: string;
  kind: "closed" | "open" | "block";
  periodId: string | null;
  seatGroupId: string | null;
}

export interface Booking {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  partySize: number;
  seatGroupId: string | null;
  courseId: string | null;
  source: Source;
  status: Status;
}

export interface StoreConfig {
  policy: Policy;
  seatGroups: SeatGroup[];
  periods: Period[];
  courses: Course[];
  overrides: Override[];
}

export interface SlotOption {
  courseId: string | null;
  seatGroupId: string;
  endMin: number;
}

export interface Slot {
  periodId: string;
  startMin: number;
  options: SlotOption[];
}

export interface BookingRequest {
  date: string;
  startMin: number;
  partySize: number;
  courseId: string | null;
  seatGroupId?: string | null; // 店側の手入力でだけ指定できる
  mode: Mode;
  excludeId?: string; // 予約の変更時、自分自身を数えない
}

export type CheckResult =
  | { ok: true; periodId: string; seatGroupId: string; endMin: number }
  | { ok: false; reason: RejectReason };

export type RejectReason =
  | "closed"
  | "outside_window"
  | "past_cutoff"
  | "invalid_time"
  | "party_size"
  | "course_unavailable"
  | "course_sold_out"
  | "full";

const isActive = (b: Booking) => ACTIVE_STATUSES.includes(b.status);
const overlaps = (b: Booking, start: number, end: number) => b.startMin < end && b.endMin > start;

/** その日・その営業枠が営業しているか */
export function isPeriodOpen(config: StoreConfig, date: string, period: Period): boolean {
  const todays = config.overrides.filter((o) => o.date === date && (o.periodId === null || o.periodId === period.id));
  if (todays.some((o) => o.kind === "closed")) return false;
  if (todays.some((o) => o.kind === "open")) return true;
  return (period.weekdays & (1 << weekday(date))) !== 0;
}

function isBlocked(config: StoreConfig, date: string, periodId: string, seatGroupId: string): boolean {
  return config.overrides.some(
    (o) =>
      o.kind === "block" &&
      o.date === date &&
      (o.periodId === null || o.periodId === periodId) &&
      (o.seatGroupId === null || o.seatGroupId === seatGroupId),
  );
}

/** 時間帯と重なる予約の人数の合計 */
export function overlappingParty(
  bookings: Booking[],
  date: string,
  seatGroupId: string,
  start: number,
  end: number,
  opts: { webOnly?: boolean; excludeId?: string } = {},
): number {
  let sum = 0;
  for (const b of bookings) {
    if (b.date !== date || b.seatGroupId !== seatGroupId || !isActive(b) || b.id === opts.excludeId) continue;
    if (opts.webOnly && b.source !== "web") continue;
    if (overlaps(b, start, end)) sum += b.partySize;
  }
  return sum;
}

/** コースのその日の残り人数（制限なしなら Infinity） */
export function courseRemaining(course: Course, bookings: Booking[], date: string, excludeId?: string): number {
  if (course.dailyLimit === null) return Number.POSITIVE_INFINITY;
  const used = bookings
    .filter((b) => b.date === date && b.courseId === course.id && isActive(b) && b.id !== excludeId)
    .reduce((s, b) => s + b.partySize, 0);
  return course.dailyLimit - used;
}

function groupFits(
  config: StoreConfig,
  bookings: Booking[],
  group: SeatGroup,
  req: BookingRequest,
  periodId: string,
  endMin: number,
): boolean {
  if (req.partySize < group.minParty || req.partySize > group.maxParty) return false;
  if (isBlocked(config, req.date, periodId, group.id)) return false;
  const all = overlappingParty(bookings, req.date, group.id, req.startMin, endMin, { excludeId: req.excludeId });
  if (all + req.partySize > group.capacity) return false;
  if (req.mode === "web") {
    const web = overlappingParty(bookings, req.date, group.id, req.startMin, endMin, {
      webOnly: true,
      excludeId: req.excludeId,
    });
    if (web + req.partySize > group.onlineCapacity) return false;
  }
  return true;
}

/** 1件の予約を受けられるかを確かめ、入れる席の種類を決める */
export function checkBooking(config: StoreConfig, bookings: Booking[], req: BookingRequest, now: JstNow): CheckResult {
  const isWeb = req.mode === "web";

  if (!Number.isInteger(req.partySize) || req.partySize < 1) return { ok: false, reason: "party_size" };
  if (isWeb && req.partySize > config.policy.maxPartyOnline) return { ok: false, reason: "party_size" };

  if (isWeb) {
    const ahead = daysBetween(now.date, req.date);
    if (ahead < 0 || ahead > config.policy.bookingWindowDays) return { ok: false, reason: "outside_window" };
    if (minutesUntil(now, req.date, req.startMin) < config.policy.cutoffMinutes) {
      return { ok: false, reason: "past_cutoff" };
    }
  }

  // 入店時刻が属する営業枠を探す（ネット予約は決められた入店時刻だけ、店側は枠内の任意の時刻）
  const period = [...config.periods]
    .sort((a, b) => a.sort - b.sort)
    .find((p) =>
      isWeb
        ? p.startTimes.includes(req.startMin) && req.startMin <= p.lastEntry
        : req.startMin >= Math.min(...p.startTimes) && req.startMin <= p.lastEntry,
    );
  if (!period) return { ok: false, reason: "invalid_time" };
  if (!isPeriodOpen(config, req.date, period)) return { ok: false, reason: "closed" };

  let duration = period.duration;
  if (req.courseId !== null) {
    const course = config.courses.find((c) => c.id === req.courseId);
    if (!course || !course.periodIds.includes(period.id) || (isWeb && !course.online)) {
      return { ok: false, reason: "course_unavailable" };
    }
    if (req.partySize < course.minParty || req.partySize > course.maxParty) return { ok: false, reason: "party_size" };
    if (courseRemaining(course, bookings, req.date, req.excludeId) < req.partySize) {
      return { ok: false, reason: "course_sold_out" };
    }
    duration = course.duration ?? period.duration;
  }
  const endMin = req.startMin + duration;

  const groups = [...config.seatGroups]
    .filter((g) => !req.seatGroupId || g.id === req.seatGroupId)
    .sort((a, b) => a.sort - b.sort);
  const group = groups.find((g) => groupFits(config, bookings, g, req, period.id, endMin));
  if (!group) return { ok: false, reason: "full" };

  return { ok: true, periodId: period.id, seatGroupId: group.id, endMin };
}

/** ある日の、ある人数で予約できる時間とコースの一覧（ネット予約用） */
export function listSlots(
  config: StoreConfig,
  bookings: Booking[],
  date: string,
  partySize: number,
  now: JstNow,
): Slot[] {
  const slots: Slot[] = [];
  const periods = [...config.periods].sort((a, b) => a.sort - b.sort);
  for (const period of periods) {
    if (!isPeriodOpen(config, date, period)) continue;
    const courses = config.courses.filter((c) => c.online && c.periodIds.includes(period.id));
    const courseIds: (string | null)[] = courses.length > 0 ? courses.map((c) => c.id) : [null];
    for (const startMin of [...period.startTimes].sort((a, b) => a - b)) {
      if (startMin > period.lastEntry) continue;
      const options: SlotOption[] = [];
      for (const courseId of courseIds) {
        const r = checkBooking(config, bookings, { date, startMin, partySize, courseId, mode: "web" }, now);
        if (r.ok) options.push({ courseId, seatGroupId: r.seatGroupId, endMin: r.endMin });
      }
      if (options.length > 0) slots.push({ periodId: period.id, startMin, options });
    }
  }
  return slots;
}

export interface PeriodSummary {
  periodId: string;
  open: boolean;
  capacity: number; // 席数の合計
  guests: number; // 予約の人数（来店済みを含む）
  groups: number; // 予約の組数
}

/**
 * 台帳・カレンダー用：その日の営業枠ごとの予約数と席数。
 * counts は営業枠ごとの { guests, groups }（キャンセル・無断キャンセルを除いたもの）。
 */
export function summarizeDay(
  config: StoreConfig,
  date: string,
  counts: Map<string, { guests: number; groups: number }>,
): PeriodSummary[] {
  const capacity = config.seatGroups.reduce((s, g) => s + g.capacity, 0);
  return [...config.periods]
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({
      periodId: p.id,
      open: isPeriodOpen(config, date, p),
      capacity,
      guests: counts.get(p.id)?.guests ?? 0,
      groups: counts.get(p.id)?.groups ?? 0,
    }));
}
