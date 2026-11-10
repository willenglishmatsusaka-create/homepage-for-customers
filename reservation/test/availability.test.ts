import { describe, expect, it } from "vitest";
import { type Booking, checkBooking, listSlots, type StoreConfig } from "../src/availability";
import type { JstNow } from "../src/time";

// 2026-12-02 は水曜（定休日）、12-03 は木曜
const config = (): StoreConfig => ({
  policy: { bookingWindowDays: 60, cutoffMinutes: 1440, maxPartyOnline: 6 },
  seatGroups: [
    { id: "counter", capacity: 8, onlineCapacity: 2, minParty: 1, maxParty: 4, sort: 1 },
    { id: "table", capacity: 4, onlineCapacity: 2, minParty: 2, maxParty: 4, sort: 2 },
  ],
  periods: [
    { id: "lunch", weekdays: 119, startTimes: [720, 750], lastEntry: 750, duration: 120, sort: 1 },
    { id: "dinner", weekdays: 119, startTimes: [1080, 1110], lastEntry: 1140, duration: 150, sort: 2 },
  ],
  courses: [
    { id: "lunch", duration: 120, minParty: 1, maxParty: 6, dailyLimit: null, periodIds: ["lunch"], online: true },
    { id: "dinner", duration: 150, minParty: 1, maxParty: 6, dailyLimit: null, periodIds: ["dinner"], online: true },
    { id: "wagyu", duration: 150, minParty: 2, maxParty: 6, dailyLimit: 6, periodIds: ["dinner"], online: true },
  ],
  overrides: [],
});

const now: JstNow = { date: "2026-11-10", min: 600 };
const THU = "2026-12-03";
const WED = "2026-12-02";

let seq = 0;
const booking = (p: Partial<Booking>): Booking => ({
  id: `b${++seq}`,
  date: THU,
  startMin: 1080,
  endMin: 1230,
  partySize: 2,
  seatGroupId: "counter",
  courseId: "dinner",
  source: "phone",
  status: "confirmed",
  ...p,
});

const web = (p: Partial<Parameters<typeof checkBooking>[2]> = {}) => ({
  date: THU,
  startMin: 1080,
  partySize: 2,
  courseId: "dinner" as string | null,
  mode: "web" as const,
  ...p,
});

describe("checkBooking", () => {
  it("営業日の空いている枠は予約できる", () => {
    const r = checkBooking(config(), [], web(), now);
    expect(r).toEqual({ ok: true, periodId: "dinner", seatGroupId: "counter", endMin: 1230 });
  });

  it("定休日は予約できない", () => {
    expect(checkBooking(config(), [], web({ date: WED }), now)).toEqual({ ok: false, reason: "closed" });
  });

  it("臨時営業の日は定休日でも予約できる", () => {
    const c = config();
    c.overrides.push({ date: WED, kind: "open", periodId: null, seatGroupId: null });
    expect(checkBooking(c, [], web({ date: WED }), now).ok).toBe(true);
  });

  it("臨時休業の枠は予約できない（他の枠は開いたまま）", () => {
    const c = config();
    c.overrides.push({ date: THU, kind: "closed", periodId: "dinner", seatGroupId: null });
    expect(checkBooking(c, [], web(), now)).toEqual({ ok: false, reason: "closed" });
    expect(checkBooking(c, [], web({ startMin: 720, courseId: "lunch" }), now).ok).toBe(true);
  });

  it("ネット予約は締切（前日の同時刻）を過ぎると受けない。店側は受けられる", () => {
    const late: JstNow = { date: "2026-12-02", min: 1081 };
    expect(checkBooking(config(), [], web(), late)).toEqual({ ok: false, reason: "past_cutoff" });
    expect(checkBooking(config(), [], web({ mode: "staff" }), late).ok).toBe(true);
  });

  it("受付期間より先の日は受けない", () => {
    expect(checkBooking(config(), [], web({ date: "2027-02-01" }), now)).toEqual({ ok: false, reason: "outside_window" });
  });

  it("ネット予約は決められた入店時刻だけ。店側は営業枠の中なら自由な時刻で入れられる", () => {
    expect(checkBooking(config(), [], web({ startMin: 1095 }), now)).toEqual({ ok: false, reason: "invalid_time" });
    expect(checkBooking(config(), [], web({ startMin: 1095, mode: "staff" }), now).ok).toBe(true);
  });

  it("ネット予約の人数上限を超えると受けない", () => {
    expect(checkBooking(config(), [], web({ partySize: 7 }), now)).toEqual({ ok: false, reason: "party_size" });
  });

  it("ネットに出す席数を超えたら、別の席の種類に回す", () => {
    const bookings = [booking({ source: "web", partySize: 2, seatGroupId: "counter" })];
    const r = checkBooking(config(), bookings, web(), now);
    expect(r).toMatchObject({ ok: true, seatGroupId: "table" });
  });

  it("ネットに出す席がすべて埋まると満席。店側はまだ入れられる", () => {
    const bookings = [
      booking({ source: "web", seatGroupId: "counter" }),
      booking({ source: "web", seatGroupId: "table" }),
    ];
    expect(checkBooking(config(), bookings, web(), now)).toEqual({ ok: false, reason: "full" });
    expect(checkBooking(config(), bookings, web({ mode: "staff" }), now)).toMatchObject({ ok: true, seatGroupId: "counter" });
  });

  it("電話予約で席が埋まっていれば、ネットの席数が残っていても満席", () => {
    const bookings = [
      booking({ seatGroupId: "counter", partySize: 4 }),
      booking({ seatGroupId: "counter", partySize: 4 }),
      booking({ seatGroupId: "table", partySize: 4 }),
    ];
    expect(checkBooking(config(), bookings, web(), now)).toEqual({ ok: false, reason: "full" });
    expect(checkBooking(config(), bookings, web({ mode: "staff" }), now)).toEqual({ ok: false, reason: "full" });
  });

  it("時間が重ならない予約は数えない（ランチの予約はディナーに影響しない）", () => {
    const bookings = [booking({ startMin: 720, endMin: 840, partySize: 8, courseId: "lunch" })];
    expect(checkBooking(config(), bookings, web(), now).ok).toBe(true);
  });

  it("キャンセル・無断キャンセル・来店済みの予約は数えない", () => {
    const bookings = (["cancelled", "no_show", "done"] as const).map((status) =>
      booking({ source: "web", status, seatGroupId: "counter" }),
    );
    expect(checkBooking(config(), bookings, web(), now)).toMatchObject({ ok: true, seatGroupId: "counter" });
  });

  it("コースの1日の人数を超えると受けない", () => {
    const bookings = [booking({ courseId: "wagyu", partySize: 2 }), booking({ courseId: "wagyu", partySize: 3 })];
    expect(checkBooking(config(), bookings, web({ courseId: "wagyu" }), now)).toEqual({
      ok: false,
      reason: "course_sold_out",
    });
    expect(checkBooking(config(), bookings, web({ courseId: "wagyu", partySize: 1 }), now)).toEqual({
      ok: false,
      reason: "party_size", // 和牛コースは2名から
    });
  });

  it("貸切などで席を閉じた日は、その席の種類を使わない", () => {
    const c = config();
    c.overrides.push({ date: THU, kind: "block", periodId: "dinner", seatGroupId: "counter" });
    expect(checkBooking(c, [], web(), now)).toMatchObject({ ok: true, seatGroupId: "table" });
    c.overrides.push({ date: THU, kind: "block", periodId: "dinner", seatGroupId: null });
    expect(checkBooking(c, [], web(), now)).toEqual({ ok: false, reason: "full" });
  });

  it("予約の変更では自分自身を数えない", () => {
    const own = booking({ id: "me", source: "web", seatGroupId: "counter" });
    const other = booking({ source: "web", seatGroupId: "table" });
    expect(checkBooking(config(), [own, other], web({ excludeId: "me" }), now)).toMatchObject({ ok: true, seatGroupId: "counter" });
  });
});

describe("listSlots", () => {
  it("営業日は枠ごとに時間とコースを返す", () => {
    const slots = listSlots(config(), [], THU, 2, now);
    expect(slots.map((s) => [s.periodId, s.startMin, s.options.map((o) => o.courseId)])).toEqual([
      ["lunch", 720, ["lunch"]],
      ["lunch", 750, ["lunch"]],
      ["dinner", 1080, ["dinner", "wagyu"]],
      ["dinner", 1110, ["dinner", "wagyu"]],
    ]);
  });

  it("定休日は空", () => {
    expect(listSlots(config(), [], WED, 2, now)).toEqual([]);
  });

  it("1名なら2名からのコースは出さない", () => {
    const dinner = listSlots(config(), [], THU, 1, now).filter((s) => s.periodId === "dinner");
    expect(dinner.every((s) => s.options.every((o) => o.courseId !== "wagyu"))).toBe(true);
  });
});

describe("summarizeDay", () => {
  it("営業枠ごとに席数・人数・組数・営業の有無を返す", async () => {
    const { summarizeDay } = await import("../src/availability");
    const counts = new Map([["dinner", { guests: 6, groups: 2 }]]);
    expect(summarizeDay(config(), THU, counts)).toEqual([
      { periodId: "lunch", open: true, capacity: 12, guests: 0, groups: 0 },
      { periodId: "dinner", open: true, capacity: 12, guests: 6, groups: 2 },
    ]);
    expect(summarizeDay(config(), WED, new Map()).every((p) => !p.open)).toBe(true);
  });
});
