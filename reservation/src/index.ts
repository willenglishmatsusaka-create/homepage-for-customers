/**
 * ATSURAE 予約・顧客管理 — Cloudflare Worker（全店共通）
 *
 * 予約ページ（/r/:store/、/r/:store/manage）… public/book/ の画面を返す
 *
 * お客様向け（/api/:store/…）
 *   GET  config                    店名・コース・営業枠・受付ルール
 *   GET  calendar?party=&from=&days=  日ごとの空き（カレンダー用）
 *   GET  slots?date=&party=        その日の時間とコース
 *   POST reservations              予約（Turnstile 設定時は確認する）
 *   GET  manage/:token             予約の確認
 *   POST manage/:token/cancel      予約のキャンセル
 *
 * お店向け（/admin/api/:store/…、Authorization: Bearer ADMIN_TOKEN）
 *   GET   config                   営業設定（席・営業枠・コース・受付ルール）
 *   GET   summary?from=&days=      日ごと・営業枠ごとの予約数と席数（カレンダー用）
 *   GET   reservations?date=       その日の予約（台帳）と営業枠ごとの集計
 *   POST  reservations             電話などの予約を手入力（force で席数を超えて入れられる）
 *   PATCH reservations/:id         状態・メモ・席の変更
 *   GET   customers?q=             顧客検索（名前・ふりがな・電話番号）
 *   GET   customers/:id / PATCH customers/:id  顧客の詳細と来店履歴、メモなどの更新
 *   GET   overrides?from=&to= / POST overrides / DELETE overrides/:id  臨時休業・臨時営業・席を閉じる
 *
 * ADMIN_TOKEN は試行用の仮の認証。店主ごとのログイン（メールのリンク）に置き換える予定。
 */

import { Hono, type Context } from "hono";
import {
  type BookingRequest,
  checkBooking,
  isPeriodOpen,
  listSlots,
  type RejectReason,
  summarizeDay,
  type Source,
  type Status,
} from "./availability";
import {
  addOverride,
  countByDay,
  deleteOverride,
  getCustomer,
  listOverrides,
  updateCustomer,
  type FullConfig,
  getReservation,
  getReservationByToken,
  getStore,
  insertReservation,
  listReservations,
  loadBookings,
  loadConfig,
  notificationStmt,
  searchCustomers,
  updateReservation,
} from "./repo";
import { addDays, isValidDate, jstNow, minutesUntil, parseTime } from "./time";
import { cleanText, isEmail, normalizePhone, randomToken, safeEqual, sha256Hex } from "./util";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TURNSTILE_SITE_KEY?: string;
  EMAIL_ENABLED?: string; // メール送信を始めたら "true"。予約完了画面の案内が変わる
  ADMIN_TOKEN?: string;
  TURNSTILE_SECRET?: string;
}

type Store = NonNullable<Awaited<ReturnType<typeof getStore>>>;
type AppEnv = { Bindings: Env; Variables: { store: Store } };

const STAFF_SOURCES: Source[] = ["phone", "walkin", "tablecheck", "ikyu", "tabelog", "other"];
const STATUSES: Status[] = ["confirmed", "seated", "done", "cancelled", "no_show"];

const REASON_MESSAGES: Record<RejectReason, { ja: string; en: string }> = {
  closed: { ja: "この日は営業していません。", en: "We are closed on this day." },
  outside_window: { ja: "この日はまだ予約を受け付けていません。", en: "Reservations are not yet open for this date." },
  past_cutoff: { ja: "ネット予約の受付は終了しました。お電話でお問い合わせください。", en: "Online booking has closed for this time. Please call us." },
  invalid_time: { ja: "この時間は選べません。", en: "This time is not available." },
  party_size: { ja: "この人数はネットで予約できません。お電話でお問い合わせください。", en: "Please call us for this party size." },
  course_unavailable: { ja: "このコースは選べません。", en: "This course is not available." },
  course_sold_out: { ja: "このコースはこの日の受付を終了しました。", en: "This course is sold out for the day." },
  full: { ja: "申し訳ありません。この時間は満席です。", en: "Sorry, this time is fully booked." },
};

const app = new Hono<AppEnv>();

// 予約ページ：店舗ごとの URL で同じ画面を返す（店舗の判定は画面側で URL から行う）
const bookingPage = async (c: Context<AppEnv>) => {
  const store = await getStore(c.env.DB, c.req.param("store")!);
  if (!store) return c.text("Not found", 404);
  const res = await c.env.ASSETS.fetch(new URL("/book/", c.req.url));
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("Referrer-Policy", "no-referrer"); // 予約確認リンクの鍵を外部に送らない
  return new Response(res.body, { status: res.status, headers });
};
app.get("/r/:store", (c) => c.redirect(`/r/${c.req.param("store")}/${new URL(c.req.url).search}`, 301));
app.get("/r/:store/", bookingPage);
app.get("/r/:store/manage", bookingPage);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "server_error" }, 500);
});

// 店舗を読み込む（お客様向け・お店向け共通）
const withStore = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  const store = await getStore(c.env.DB, c.req.param("store")!);
  if (!store) return c.json({ error: "store_not_found" }, 404);
  c.set("store", store);
  await next();
};

app.use("/api/:store/*", withStore);
app.use("/admin/api/:store/*", async (c, next) => {
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) return c.json({ error: "admin_not_configured" }, 503);
  const given = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!(await safeEqual(given, expected))) return c.json({ error: "unauthorized" }, 401);
  return withStore(c, next);
});

// ---------- お客様向け ----------

app.get("/api/:store/config", async (c) => {
  const store = c.get("store");
  const today = jstNow().date;
  const config = await loadConfig(c.env.DB, store, today, today);
  return c.json(
    {
      store: { slug: store.slug, name: store.name, nameEn: store.nameEn, phone: store.phone, theme: store.theme },
      policy: {
        bookingWindowDays: config.policy.bookingWindowDays,
        cutoffMinutes: config.policy.cutoffMinutes,
        maxPartyOnline: config.policy.maxPartyOnline,
      },
      texts: store.texts,
      features: {
        email: c.env.EMAIL_ENABLED === "true",
        turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null,
      },
      periods: config.periods.map(({ id, nameJa, nameEn }) => ({ id, nameJa, nameEn })),
      courses: config.courses
        .filter((co) => co.online)
        .map(({ id, nameJa, nameEn, descriptionJa, descriptionEn, price, minParty, maxParty }) => ({
          id, nameJa, nameEn, descriptionJa, descriptionEn, price, minParty, maxParty,
        })),
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
});

app.get("/api/:store/calendar", async (c) => {
  const store = c.get("store");
  const party = Number(c.req.query("party") ?? 2);
  const now = jstNow();
  const from = c.req.query("from") ?? now.date;
  const days = Math.min(Number(c.req.query("days") ?? 31), 62);
  if (!isValidDate(from) || !Number.isInteger(party) || party < 1 || !Number.isInteger(days) || days < 1) {
    return c.json({ error: "invalid_query" }, 400);
  }
  const to = addDays(from, days - 1);
  const [config, bookings] = await Promise.all([
    loadConfig(c.env.DB, store, from, to),
    loadBookings(c.env.DB, store.id, from, to),
  ]);
  const result = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const open = config.periods.some((p) => isPeriodOpen(config, date, p));
    const available = open && listSlots(config, bookings, date, party, now).length > 0;
    result.push({ date, open, available });
  }
  return c.json({ party, days: result });
});

app.get("/api/:store/slots", async (c) => {
  const store = c.get("store");
  const date = c.req.query("date");
  const party = Number(c.req.query("party") ?? 2);
  if (!isValidDate(date) || !Number.isInteger(party) || party < 1) return c.json({ error: "invalid_query" }, 400);
  const [config, bookings] = await Promise.all([
    loadConfig(c.env.DB, store, date, date),
    loadBookings(c.env.DB, store.id, date, date),
  ]);
  const slots = listSlots(config, bookings, date, party, jstNow());
  // お客様には席の種類を見せない
  return c.json({
    date,
    party,
    slots: slots.map((s) => ({ periodId: s.periodId, startMin: s.startMin, courseIds: s.options.map((o) => o.courseId) })),
  });
});

app.post("/api/:store/reservations", async (c) => {
  const store = c.get("store");
  const body = await readJson(c);
  if (!body) return c.json({ error: "invalid_body" }, 400);

  if (c.env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken, c.req.header("CF-Connecting-IP"));
    if (!ok) return c.json({ error: "turnstile_failed" }, 403);
  }

  const lang = body.lang === "en" ? "en" : "ja";
  const date = body.date;
  const startMin = typeof body.time === "string" ? parseTime(body.time) : body.startMin;
  const partySize = body.partySize;
  const name = cleanText(body.name, 80);
  const phone = normalizePhone(body.phone);
  const email = cleanText(body.email, 254);
  if (!isValidDate(date) || !Number.isInteger(startMin) || !Number.isInteger(partySize)) {
    return c.json({ error: "invalid_body", fields: ["date", "time", "partySize"] }, 400);
  }
  const missing = [!name && "name", !phone && "phone", !isEmail(email) && "email"].filter(Boolean);
  if (missing.length > 0) return c.json({ error: "invalid_body", fields: missing }, 400);
  if (body.agreePolicy !== true) return c.json({ error: "policy_not_agreed" }, 400);

  const req: BookingRequest = {
    date,
    startMin,
    partySize,
    courseId: typeof body.courseId === "string" ? body.courseId : null,
    mode: "web",
  };
  const now = jstNow();
  const [config, bookings] = await Promise.all([
    loadConfig(c.env.DB, store, date, date),
    loadBookings(c.env.DB, store.id, date, date),
  ]);
  const check = checkBooking(config, bookings, req, now);
  if (!check.ok) return reject(c, check.reason, lang);

  const token = randomToken();
  const id = `rs_${crypto.randomUUID()}`;
  const saved = await insertReservation(c.env.DB, {
    id,
    storeId: store.id,
    date,
    startMin,
    endMin: check.endMin,
    partySize,
    periodId: check.periodId,
    courseId: req.courseId,
    seatGroupId: check.seatGroupId,
    source: "web",
    guest: {
      name: name!,
      kana: cleanText(body.kana, 80),
      phone,
      email,
      allergies: cleanText(body.allergies, 500),
      lang,
    },
    guestNote: cleanText(body.note, 1000),
    staffNote: null,
    manageTokenHash: await sha256Hex(token),
    createdBy: "guest",
    guard: guardFor(config, check.seatGroupId, req.courseId, "web"),
    notifications: [{ kind: "confirm" }, { kind: "owner_new" }, ...reminder(date, now)],
  });
  // 確認から保存までの間に他の予約で埋まった場合
  if (!saved) return reject(c, "full", lang);

  return c.json({ id, manageToken: token, date, startMin, endMin: check.endMin, partySize }, 201);
});

app.get("/api/:store/manage/:token", async (c) => {
  const store = c.get("store");
  const r = await getReservationByToken(c.env.DB, store.id, await sha256Hex(c.req.param("token")));
  if (!r) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: r.id,
    date: r.date,
    startMin: r.startMin,
    partySize: r.partySize,
    courseId: r.courseId,
    status: r.status,
    name: r.guestName,
    note: r.guestNote,
  });
});

app.post("/api/:store/manage/:token/cancel", async (c) => {
  const store = c.get("store");
  const r = await getReservationByToken(c.env.DB, store.id, await sha256Hex(c.req.param("token")));
  if (!r) return c.json({ error: "not_found" }, 404);
  if (r.status !== "confirmed") return c.json({ error: "not_cancellable", status: r.status }, 409);
  if (minutesUntil(jstNow(), r.date, r.startMin) < 0) return c.json({ error: "already_started" }, 409);
  await updateReservation(c.env.DB, r, store.id, "guest", { status: "cancelled" }, [
    notificationStmt(c.env.DB, store.id, r.id, "cancel"),
    notificationStmt(c.env.DB, store.id, r.id, "owner_cancel"),
  ]);
  return c.json({ id: r.id, status: "cancelled" });
});

// ---------- お店向け ----------

app.get("/admin/api/:store/config", async (c) => {
  const store = c.get("store");
  const today = jstNow().date;
  const config = await loadConfig(c.env.DB, store, today, today);
  return c.json({
    store: { slug: store.slug, name: store.name, nameEn: store.nameEn, theme: store.theme },
    today,
    policy: config.policy,
    seatGroups: config.seatGroups,
    periods: config.periods,
    courses: config.courses,
  });
});

app.get("/admin/api/:store/summary", async (c) => {
  const store = c.get("store");
  const from = c.req.query("from") ?? jstNow().date;
  const days = Number(c.req.query("days") ?? 42);
  if (!isValidDate(from) || !Number.isInteger(days) || days < 1 || days > 62) {
    return c.json({ error: "invalid_query" }, 400);
  }
  const to = addDays(from, days - 1);
  const [config, counts] = await Promise.all([
    loadConfig(c.env.DB, store, from, to),
    countByDay(c.env.DB, store.id, from, to),
  ]);
  const result = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    result.push({ date, periods: summarizeDay(config, date, counts.get(date) ?? new Map()) });
  }
  return c.json({ from, days: result });
});

app.get("/admin/api/:store/reservations", async (c) => {
  const store = c.get("store");
  const date = c.req.query("date") ?? jstNow().date;
  if (!isValidDate(date)) return c.json({ error: "invalid_query" }, 400);
  const [reservations, config, counts, overrides] = await Promise.all([
    listReservations(c.env.DB, store.id, date),
    loadConfig(c.env.DB, store, date, date),
    countByDay(c.env.DB, store.id, date, date),
    listOverrides(c.env.DB, store.id, date, date),
  ]);
  const active = reservations.filter((r) => r.status === "confirmed" || r.status === "seated" || r.status === "done");
  return c.json({
    date,
    totalGuests: active.reduce((s, r) => s + r.partySize, 0),
    periods: summarizeDay(config, date, counts.get(date) ?? new Map()),
    overrides,
    reservations,
  });
});

app.post("/admin/api/:store/reservations", async (c) => {
  const store = c.get("store");
  const body = await readJson(c);
  if (!body) return c.json({ error: "invalid_body" }, 400);

  const date = body.date;
  const startMin = typeof body.time === "string" ? parseTime(body.time) : body.startMin;
  const partySize = body.partySize;
  const source: Source = STAFF_SOURCES.includes(body.source) ? body.source : "phone";
  const name = cleanText(body.name, 80);
  if (!isValidDate(date) || !Number.isInteger(startMin) || !Number.isInteger(partySize) || !name) {
    return c.json({ error: "invalid_body", fields: ["date", "time", "partySize", "name"] }, 400);
  }
  const email = cleanText(body.email, 254);
  if (email && !isEmail(email)) return c.json({ error: "invalid_body", fields: ["email"] }, 400);

  const req: BookingRequest = {
    date,
    startMin,
    partySize,
    courseId: typeof body.courseId === "string" ? body.courseId : null,
    seatGroupId: typeof body.seatGroupId === "string" ? body.seatGroupId : null,
    mode: "staff",
  };
  const force = body.force === true;
  const now = jstNow();
  const [config, bookings] = await Promise.all([
    loadConfig(c.env.DB, store, date, date),
    loadBookings(c.env.DB, store.id, date, date),
  ]);
  const check = checkBooking(config, bookings, req, now);
  if (!check.ok && !force) return c.json({ error: check.reason, canForce: true }, 409);

  const period =
    config.periods.find((p) => startMin >= Math.min(...p.startTimes) && startMin <= p.lastEntry) ?? config.periods[0];
  const course = config.courses.find((co) => co.id === req.courseId);
  const endMin = check.ok ? check.endMin : startMin + (course?.duration ?? period?.duration ?? 120);
  // 強制で入れた予約も必ずどこかの席の種類に入れて、以降の空き計算で数えられるようにする
  const fallbackGroup = [...config.seatGroups].sort((a, b) => a.sort - b.sort)[0]?.id ?? null;
  const seatGroupId = check.ok ? check.seatGroupId : (req.seatGroupId ?? fallbackGroup);

  const id = `rs_${crypto.randomUUID()}`;
  const token = email ? randomToken() : null;
  const actor = "staff"; // 店主ごとのログインを入れたら、ユーザーの ID にする
  const saved = await insertReservation(c.env.DB, {
    id,
    storeId: store.id,
    date,
    startMin,
    endMin,
    partySize,
    periodId: check.ok ? check.periodId : (period?.id ?? ""),
    courseId: req.courseId,
    seatGroupId,
    source,
    customerId: typeof body.customerId === "string" ? body.customerId : null,
    guest: {
      name,
      kana: cleanText(body.kana, 80),
      phone: normalizePhone(body.phone),
      email,
      allergies: cleanText(body.allergies, 500),
      lang: body.lang === "en" ? "en" : "ja",
    },
    guestNote: cleanText(body.note, 1000),
    staffNote: cleanText(body.staffNote, 1000),
    manageTokenHash: token ? await sha256Hex(token) : null,
    createdBy: actor,
    guard: force || !seatGroupId ? null : guardFor(config, seatGroupId, req.courseId, "staff"),
    // 電話予約でもメールがあれば確定・リマインドを送る。グルメサイト経由は各サイトが送るので送らない
    notifications:
      email && (source === "phone" || source === "walkin")
        ? [{ kind: "confirm" }, ...reminder(date, now)]
        : [],
  });
  if (!saved) return c.json({ error: "full", canForce: true }, 409);
  return c.json({ id, seatGroupId, endMin, forced: !check.ok }, 201);
});

app.patch("/admin/api/:store/reservations/:id", async (c) => {
  const store = c.get("store");
  const body = await readJson(c);
  if (!body) return c.json({ error: "invalid_body" }, 400);
  const current = await getReservation(c.env.DB, store.id, c.req.param("id"));
  if (!current) return c.json({ error: "not_found" }, 404);
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return c.json({ error: "invalid_body", fields: ["status"] }, 400);
  }
  const patch: { status?: Status; staffNote?: string | null; seatGroupId?: string | null } = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.staffNote !== undefined) patch.staffNote = cleanText(body.staffNote, 1000);
  if (body.seatGroupId !== undefined) patch.seatGroupId = typeof body.seatGroupId === "string" ? body.seatGroupId : null;
  const extra =
    patch.status === "cancelled" && current.status !== "cancelled" && current.customer?.email
      ? [notificationStmt(c.env.DB, store.id, current.id, "cancel")]
      : [];
  await updateReservation(c.env.DB, current, store.id, "staff", patch, extra);
  return c.json(await getReservation(c.env.DB, store.id, current.id));
});

app.get("/admin/api/:store/customers", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json({ customers: [] });
  return c.json({ customers: await searchCustomers(c.env.DB, c.get("store").id, q.slice(0, 50)) });
});

app.get("/admin/api/:store/customers/:id", async (c) => {
  const customer = await getCustomer(c.env.DB, c.get("store").id, c.req.param("id"));
  return customer ? c.json(customer) : c.json({ error: "not_found" }, 404);
});

app.patch("/admin/api/:store/customers/:id", async (c) => {
  const store = c.get("store");
  const body = await readJson(c);
  if (!body) return c.json({ error: "invalid_body" }, 400);
  const text = (k: string, max: number) => (body[k] === undefined ? undefined : cleanText(body[k], max));
  const name = text("name", 80);
  if (body.name !== undefined && !name) return c.json({ error: "invalid_body", fields: ["name"] }, 400);
  const email = text("email", 254);
  if (email && !isEmail(email)) return c.json({ error: "invalid_body", fields: ["email"] }, 400);
  let anniversaries: { label: string; date: string }[] | undefined;
  if (body.anniversaries !== undefined) {
    if (!Array.isArray(body.anniversaries)) return c.json({ error: "invalid_body", fields: ["anniversaries"] }, 400);
    anniversaries = body.anniversaries
      .slice(0, 10)
      .map((a: any) => ({ label: cleanText(a?.label, 40) ?? "", date: cleanText(a?.date, 10) ?? "" }))
      .filter((a: { label: string; date: string }) => a.label || a.date);
  }
  try {
    const ok = await updateCustomer(c.env.DB, store.id, c.req.param("id"), {
      name: name ?? undefined,
      kana: text("kana", 80),
      phone: body.phone === undefined ? undefined : normalizePhone(body.phone),
      email,
      allergies: text("allergies", 500),
      preferences: text("preferences", 1000),
      notes: text("notes", 2000),
      anniversaries,
    });
    if (!ok) return c.json({ error: "not_found" }, 404);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "phone_in_use" }, 409);
    throw e;
  }
  return c.json(await getCustomer(c.env.DB, store.id, c.req.param("id")));
});

app.get("/admin/api/:store/overrides", async (c) => {
  const from = c.req.query("from") ?? jstNow().date;
  const to = c.req.query("to") ?? addDays(from, 180);
  if (!isValidDate(from) || !isValidDate(to)) return c.json({ error: "invalid_query" }, 400);
  return c.json({ overrides: await listOverrides(c.env.DB, c.get("store").id, from, to) });
});

app.post("/admin/api/:store/overrides", async (c) => {
  const body = await readJson(c);
  if (!body || !isValidDate(body.date) || !["closed", "open", "block"].includes(body.kind)) {
    return c.json({ error: "invalid_body", fields: ["date", "kind"] }, 400);
  }
  const id = await addOverride(c.env.DB, c.get("store").id, {
    date: body.date,
    kind: body.kind,
    periodId: typeof body.periodId === "string" ? body.periodId : null,
    seatGroupId: typeof body.seatGroupId === "string" ? body.seatGroupId : null,
    note: cleanText(body.note, 200),
  });
  return c.json({ id }, 201);
});

app.delete("/admin/api/:store/overrides/:id", async (c) => {
  const ok = await deleteOverride(c.env.DB, c.get("store").id, c.req.param("id"));
  return ok ? c.json({ ok }) : c.json({ error: "not_found" }, 404);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

// ---------- 補助 ----------

async function readJson(c: Context<AppEnv>): Promise<Record<string, any> | null> {
  try {
    const v = await c.req.json();
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function reject(c: Context<AppEnv>, reason: RejectReason, lang: "ja" | "en") {
  return c.json({ error: reason, message: REASON_MESSAGES[reason][lang] }, 409);
}

function guardFor(config: FullConfig, seatGroupId: string, courseId: string | null, mode: "web" | "staff") {
  const group = config.seatGroups.find((g) => g.id === seatGroupId)!;
  const course = config.courses.find((co) => co.id === courseId);
  return {
    capacity: group.capacity,
    onlineCapacity: mode === "web" ? group.onlineCapacity : null,
    courseLimit: course?.dailyLimit ?? null,
  };
}

/** 前日の10時（日本時間）にリマインド。もう過ぎていれば送らない */
function reminder(date: string, now: { date: string; min: number }) {
  const remindDate = addDays(date, -1);
  if (minutesUntil(now, remindDate, 600) <= 0) return [];
  return [{ kind: "remind" as const, sendAfter: `${remindDate} 01:00:00` }]; // UTC 01:00 = JST 10:00
}

async function verifyTurnstile(secret: string, token: unknown, ip: string | undefined): Promise<boolean> {
  if (typeof token !== "string" || token === "") return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

export default app;
