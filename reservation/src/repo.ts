// D1 の読み書き。在庫の最終確認は保存時の SQL で行い、同時に予約が来てもダブルブッキングしない。

import {
  ACTIVE_STATUSES,
  type Booking,
  type Course,
  DEFAULT_POLICY,
  type Override,
  type Period,
  type SeatGroup,
  type Source,
  type Status,
  type StoreConfig,
} from "./availability";

export interface Store {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  email: string | null;
  phone: string | null;
  theme: Record<string, string>;
  /** 予約ページに出す文章（キャンセル規定・ご来店の案内）。ja / en */
  texts: { cancelPolicy?: { ja?: string; en?: string }; notices?: { ja?: string[]; en?: string[] } };
}

export interface CourseInfo extends Course {
  nameJa: string;
  nameEn: string;
  descriptionJa: string | null;
  descriptionEn: string | null;
  price: number | null;
}

export interface PeriodInfo extends Period {
  nameJa: string;
  nameEn: string;
}

export interface SeatGroupInfo extends SeatGroup {
  nameJa: string;
  nameEn: string;
}

export interface FullConfig extends StoreConfig {
  periods: PeriodInfo[];
  courses: CourseInfo[];
  seatGroups: SeatGroupInfo[];
}

const ACTIVE_SQL = ACTIVE_STATUSES.map((s) => `'${s}'`).join(", ");

const parseJson = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export async function getStore(db: D1Database, slug: string): Promise<(Store & { policy: string }) | null> {
  const row = await db
    .prepare("SELECT id, slug, name, name_en, email, phone, theme, policy FROM stores WHERE slug = ?")
    .bind(slug)
    .first<Record<string, string | null>>();
  if (!row) return null;
  return {
    id: row.id!,
    slug: row.slug!,
    name: row.name!,
    nameEn: row.name_en,
    email: row.email,
    phone: row.phone,
    theme: parseJson(row.theme, {}),
    texts: parseJson<Record<string, any>>(row.policy, {}).texts ?? {},
    policy: row.policy ?? "{}",
  };
}

/** 営業設定と、指定期間の日付例外をまとめて読む */
export async function loadConfig(
  db: D1Database,
  store: { id: string; policy: string },
  from: string,
  to: string,
): Promise<FullConfig> {
  const [groups, periods, courses, overrides] = await db.batch([
    db.prepare("SELECT * FROM seat_groups WHERE store_id = ? ORDER BY sort").bind(store.id),
    db.prepare("SELECT * FROM service_periods WHERE store_id = ? AND active = 1 ORDER BY sort").bind(store.id),
    db.prepare("SELECT * FROM courses WHERE store_id = ? AND active = 1 ORDER BY sort").bind(store.id),
    db.prepare("SELECT * FROM date_overrides WHERE store_id = ? AND date BETWEEN ? AND ?").bind(store.id, from, to),
  ]);
  type Row = Record<string, any>;
  return {
    policy: { ...DEFAULT_POLICY, ...parseJson(store.policy, {}) },
    seatGroups: (groups.results as Row[]).map((r) => ({
      id: r.id,
      nameJa: r.name_ja,
      nameEn: r.name_en,
      capacity: r.capacity,
      onlineCapacity: r.online_capacity,
      minParty: r.min_party,
      maxParty: r.max_party,
      sort: r.sort,
    })),
    periods: (periods.results as Row[]).map((r) => ({
      id: r.id,
      nameJa: r.name_ja,
      nameEn: r.name_en,
      weekdays: r.weekdays,
      startTimes: parseJson<number[]>(r.start_times, []),
      lastEntry: r.last_entry,
      duration: r.duration,
      sort: r.sort,
    })),
    courses: (courses.results as Row[]).map((r) => ({
      id: r.id,
      nameJa: r.name_ja,
      nameEn: r.name_en,
      descriptionJa: r.description_ja,
      descriptionEn: r.description_en,
      price: r.price,
      duration: r.duration,
      minParty: r.min_party,
      maxParty: r.max_party,
      dailyLimit: r.daily_limit,
      periodIds: parseJson<string[]>(r.period_ids, []),
      online: r.online === 1,
    })),
    overrides: (overrides.results as Row[]).map(
      (r): Override => ({ date: r.date, kind: r.kind, periodId: r.period_id, seatGroupId: r.seat_group_id }),
    ),
  };
}

/** 空き計算用：期間内の有効な予約 */
export async function loadBookings(db: D1Database, storeId: string, from: string, to: string): Promise<Booking[]> {
  const { results } = await db
    .prepare(
      `SELECT id, date, start_min, end_min, party_size, seat_group_id, course_id, source, status
       FROM reservations WHERE store_id = ? AND date BETWEEN ? AND ? AND status IN (${ACTIVE_SQL})`,
    )
    .bind(storeId, from, to)
    .all<Record<string, any>>();
  return results.map((r) => ({
    id: r.id,
    date: r.date,
    startMin: r.start_min,
    endMin: r.end_min,
    partySize: r.party_size,
    seatGroupId: r.seat_group_id,
    courseId: r.course_id,
    source: r.source,
    status: r.status,
  }));
}

export interface GuestInput {
  name: string;
  kana: string | null;
  phone: string | null;
  email: string | null;
  allergies: string | null;
  lang: string;
}

export interface NewReservation {
  id: string;
  storeId: string;
  date: string;
  startMin: number;
  endMin: number;
  partySize: number;
  periodId: string;
  courseId: string | null;
  seatGroupId: string | null;
  source: Source;
  guest: GuestInput;
  customerId?: string | null; // 店側が既存の顧客を選んだとき
  guestNote: string | null;
  staffNote: string | null;
  manageTokenHash: string | null;
  createdBy: string;
  /** 保存時に確かめる在庫。null なら確かめない（店側の「強制で入れる」） */
  guard: {
    capacity: number;
    onlineCapacity: number | null; // ネット予約のときだけ
    courseLimit: number | null;
  } | null;
  notifications: { kind: "confirm" | "remind" | "owner_new"; sendAfter?: string }[];
}

/**
 * 予約を保存する。在庫の確認と保存を1つの SQL 文で行うので、同時に予約が来ても席数を超えない。
 * 席が埋まっていた場合は false を返す。
 */
export async function insertReservation(db: D1Database, r: NewReservation): Promise<boolean> {
  // 既存の顧客を電話番号で探す（店側が顧客を指定した場合はそれを使う）
  let customerId = r.customerId ?? null;
  let isNewCustomer = false;
  if (!customerId && r.guest.phone) {
    const found = await db
      .prepare("SELECT id FROM customers WHERE store_id = ? AND phone = ?")
      .bind(r.storeId, r.guest.phone)
      .first<{ id: string }>();
    customerId = found?.id ?? null;
  }
  if (!customerId) {
    customerId = `cu_${crypto.randomUUID()}`;
    isNewCustomer = true;
  }

  const sumWhere = `store_id = ?2 AND date = ?4 AND seat_group_id = ?10 AND status IN (${ACTIVE_SQL})
                    AND start_min < ?6 AND end_min > ?5`;
  const guardSql = r.guard
    ? `WHERE (SELECT COALESCE(SUM(party_size), 0) FROM reservations WHERE ${sumWhere}) + ?7 <= ?19
         AND (?20 IS NULL OR (SELECT COALESCE(SUM(party_size), 0) FROM reservations
                              WHERE ${sumWhere} AND source = 'web') + ?7 <= ?20)
         AND (?21 IS NULL OR (SELECT COALESCE(SUM(party_size), 0) FROM reservations
                              WHERE store_id = ?2 AND date = ?4 AND course_id = ?9
                                AND status IN (${ACTIVE_SQL})) + ?7 <= ?21)`
    : "WHERE ?19 IS NULL AND ?20 IS NULL AND ?21 IS NULL";

  const insert = db
    .prepare(
      `INSERT INTO reservations (id, store_id, customer_id, date, start_min, end_min, party_size, period_id,
         course_id, seat_group_id, status, source, guest_name, guest_note, staff_note, lang, manage_token_hash, created_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'confirmed', ?11, ?12, ?13, ?14, ?15, ?16, ?17
       ${guardSql}`,
    )
    .bind(
      r.id,
      r.storeId,
      customerId,
      r.date,
      r.startMin,
      r.endMin,
      r.partySize,
      r.periodId,
      r.courseId,
      r.seatGroupId,
      r.source,
      r.guest.name,
      r.guestNote,
      r.staffNote,
      r.guest.lang,
      r.manageTokenHash,
      r.createdBy,
      null, // ?18 未使用（番号をそろえるため）
      r.guard?.capacity ?? null,
      r.guard?.onlineCapacity ?? null,
      r.guard?.courseLimit ?? null,
    );

  // 以下は予約が保存できたときだけ効く（WHERE EXISTS）
  const saved = "EXISTS (SELECT 1 FROM reservations WHERE id = ?1)";
  const customer = isNewCustomer
    ? db
        .prepare(
          `INSERT INTO customers (id, store_id, name, kana, phone, email, lang, allergies)
           SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${saved}`,
        )
        .bind(r.id, customerId, r.storeId, r.guest.name, r.guest.kana, r.guest.phone, r.guest.email, r.guest.lang,
          r.guest.allergies)
    : db
        .prepare(
          `UPDATE customers SET
             kana = COALESCE(?3, kana), email = COALESCE(?4, email), allergies = COALESCE(?5, allergies),
             lang = ?6, updated_at = datetime('now')
           WHERE id = ?2 AND ${saved}`,
        )
        .bind(r.id, customerId, r.guest.kana, r.guest.email, r.guest.allergies, r.guest.lang);

  const log = db
    .prepare(
      `INSERT INTO reservation_log (store_id, reservation_id, actor, action, detail)
       SELECT ?2, ?1, ?3, 'create', ?4 WHERE ${saved}`,
    )
    .bind(r.id, r.storeId, r.createdBy, JSON.stringify({ source: r.source, forced: r.guard === null }));

  const notes = r.notifications.map((n) =>
    db
      .prepare(
        `INSERT INTO notifications (id, store_id, reservation_id, kind, send_after)
         SELECT ?2, ?3, ?1, ?4, COALESCE(?5, datetime('now')) WHERE ${saved}`,
      )
      .bind(r.id, `nt_${crypto.randomUUID()}`, r.storeId, n.kind, n.sendAfter ?? null),
  );

  const [ins] = await db.batch([insert, customer, log, ...notes]);
  return (ins.meta.changes ?? 0) > 0;
}

export interface ReservationRow {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  partySize: number;
  periodId: string | null;
  courseId: string | null;
  seatGroupId: string | null;
  status: Status;
  source: Source;
  guestName: string;
  guestNote: string | null;
  staffNote: string | null;
  lang: string;
  /** お客様に届かなかったメール（confirm / remind / cancel）。電話で連絡するための目印 */
  mailFailed: string[];
  customer: {
    id: string;
    name: string;
    kana: string | null;
    phone: string | null;
    email: string | null;
    allergies: string | null;
    anniversaries: unknown[];
    notes: string | null;
    visitCount: number;
    noShowCount: number;
  } | null;
}

const RESERVATION_SELECT = `
  SELECT r.*, c.id AS c_id, c.name AS c_name, c.kana AS c_kana, c.phone AS c_phone, c.email AS c_email,
         c.allergies AS c_allergies, c.anniversaries AS c_anniversaries, c.notes AS c_notes,
         c.visit_count AS c_visit_count, c.no_show_count AS c_no_show_count,
         (SELECT group_concat(n.kind) FROM notifications n
           WHERE n.reservation_id = r.id AND n.status = 'failed' AND n.kind IN ('confirm', 'remind', 'cancel')) AS mail_failed
  FROM reservations r LEFT JOIN customers c ON c.id = r.customer_id`;

function toReservation(r: Record<string, any>): ReservationRow {
  return {
    id: r.id,
    date: r.date,
    startMin: r.start_min,
    endMin: r.end_min,
    partySize: r.party_size,
    periodId: r.period_id,
    courseId: r.course_id,
    seatGroupId: r.seat_group_id,
    status: r.status,
    source: r.source,
    guestName: r.guest_name,
    guestNote: r.guest_note,
    staffNote: r.staff_note,
    lang: r.lang,
    mailFailed: r.mail_failed ? String(r.mail_failed).split(",") : [],
    customer: r.c_id
      ? {
          id: r.c_id,
          name: r.c_name,
          kana: r.c_kana,
          phone: r.c_phone,
          email: r.c_email,
          allergies: r.c_allergies,
          anniversaries: parseJson<unknown[]>(r.c_anniversaries, []),
          notes: r.c_notes,
          visitCount: r.c_visit_count,
          noShowCount: r.c_no_show_count,
        }
      : null,
  };
}

export async function listReservations(db: D1Database, storeId: string, date: string): Promise<ReservationRow[]> {
  const { results } = await db
    .prepare(`${RESERVATION_SELECT} WHERE r.store_id = ? AND r.date = ? ORDER BY r.start_min, r.created_at`)
    .bind(storeId, date)
    .all<Record<string, any>>();
  return results.map(toReservation);
}

export async function getReservation(db: D1Database, storeId: string, id: string): Promise<ReservationRow | null> {
  const row = await db
    .prepare(`${RESERVATION_SELECT} WHERE r.store_id = ? AND r.id = ?`)
    .bind(storeId, id)
    .first<Record<string, any>>();
  return row ? toReservation(row) : null;
}

export async function getReservationByToken(
  db: D1Database,
  storeId: string,
  tokenHash: string,
): Promise<ReservationRow | null> {
  const row = await db
    .prepare(`${RESERVATION_SELECT} WHERE r.store_id = ? AND r.manage_token_hash = ?`)
    .bind(storeId, tokenHash)
    .first<Record<string, any>>();
  return row ? toReservation(row) : null;
}

/** 状態の変更。来店済み・無断キャンセルにしたら顧客の回数も更新する */
export async function updateReservation(
  db: D1Database,
  current: ReservationRow,
  storeId: string,
  actor: string,
  patch: { status?: Status; staffNote?: string | null; seatGroupId?: string | null },
  extra: D1PreparedStatement[] = [],
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  const status = patch.status ?? current.status;
  stmts.push(
    db
      .prepare(
        `UPDATE reservations SET status = ?, staff_note = ?, seat_group_id = ?, updated_at = datetime('now')
         WHERE id = ? AND store_id = ?`,
      )
      .bind(
        status,
        patch.staffNote !== undefined ? patch.staffNote : current.staffNote,
        patch.seatGroupId !== undefined ? patch.seatGroupId : current.seatGroupId,
        current.id,
        storeId,
      ),
  );

  if (current.customer && status !== current.status) {
    const visit = (s: Status) => (s === "done" ? 1 : 0);
    const noShow = (s: Status) => (s === "no_show" ? 1 : 0);
    const dv = visit(status) - visit(current.status);
    const dn = noShow(status) - noShow(current.status);
    if (dv !== 0 || dn !== 0) {
      stmts.push(
        db
          .prepare(
            `UPDATE customers SET visit_count = MAX(0, visit_count + ?), no_show_count = MAX(0, no_show_count + ?),
               last_visit_date = CASE WHEN ? > 0 THEN MAX(COALESCE(last_visit_date, ''), ?) ELSE last_visit_date END,
               updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(dv, dn, dv, current.date, current.customer.id),
      );
    }
  }

  stmts.push(
    db
      .prepare("INSERT INTO reservation_log (store_id, reservation_id, actor, action, detail) VALUES (?, ?, ?, 'update', ?)")
      .bind(storeId, current.id, actor, JSON.stringify({ from: { status: current.status }, patch })),
  );
  await db.batch([...stmts, ...extra]);
}

export function notificationStmt(
  db: D1Database,
  storeId: string,
  reservationId: string,
  kind: "cancel" | "owner_cancel",
): D1PreparedStatement {
  return db
    .prepare("INSERT INTO notifications (id, store_id, reservation_id, kind) VALUES (?, ?, ?, ?)")
    .bind(`nt_${crypto.randomUUID()}`, storeId, reservationId, kind);
}

export async function searchCustomers(db: D1Database, storeId: string, q: string) {
  const digits = q.replace(/\D/g, "");
  const { results } = await db
    .prepare(
      `SELECT id, name, kana, phone, email, allergies, anniversaries, notes, visit_count, no_show_count, last_visit_date
       FROM customers
       WHERE store_id = ?1 AND (name LIKE ?2 OR kana LIKE ?2 OR (?3 <> '' AND phone LIKE ?4))
       ORDER BY last_visit_date DESC NULLS LAST, updated_at DESC LIMIT 20`,
    )
    .bind(storeId, `%${q}%`, digits, `%${digits.replace(/^0/, "")}%`)
    .all<Record<string, any>>();
  return results.map((r) => ({ ...r, anniversaries: parseJson(r.anniversaries, []) }));
}

export async function addOverride(
  db: D1Database,
  storeId: string,
  o: Override & { note: string | null },
): Promise<string> {
  const id = `ov_${crypto.randomUUID()}`;
  await db
    .prepare(
      "INSERT INTO date_overrides (id, store_id, date, kind, period_id, seat_group_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, storeId, o.date, o.kind, o.periodId, o.seatGroupId, o.note)
    .run();
  return id;
}

export async function deleteOverride(db: D1Database, storeId: string, id: string): Promise<boolean> {
  const r = await db.prepare("DELETE FROM date_overrides WHERE id = ? AND store_id = ?").bind(id, storeId).run();
  return (r.meta.changes ?? 0) > 0;
}

/** 日付・営業枠ごとの予約人数と組数（キャンセル・無断キャンセルを除く） */
export async function countByDay(
  db: D1Database,
  storeId: string,
  from: string,
  to: string,
): Promise<Map<string, Map<string, { guests: number; groups: number }>>> {
  const { results } = await db
    .prepare(
      `SELECT date, COALESCE(period_id, '') AS period_id, SUM(party_size) AS guests, COUNT(*) AS groups
       FROM reservations WHERE store_id = ? AND date BETWEEN ? AND ? AND status IN ('confirmed', 'seated', 'done')
       GROUP BY date, period_id`,
    )
    .bind(storeId, from, to)
    .all<{ date: string; period_id: string; guests: number; groups: number }>();
  const out = new Map<string, Map<string, { guests: number; groups: number }>>();
  for (const r of results) {
    if (!out.has(r.date)) out.set(r.date, new Map());
    out.get(r.date)!.set(r.period_id, { guests: r.guests, groups: r.groups });
  }
  return out;
}

export async function listOverrides(db: D1Database, storeId: string, from: string, to: string) {
  const { results } = await db
    .prepare(
      `SELECT id, date, kind, period_id AS periodId, seat_group_id AS seatGroupId, note
       FROM date_overrides WHERE store_id = ? AND date BETWEEN ? AND ? ORDER BY date, created_at`,
    )
    .bind(storeId, from, to)
    .all();
  return results;
}

export async function getCustomer(db: D1Database, storeId: string, id: string) {
  const c = await db
    .prepare(
      `SELECT id, name, kana, phone, email, lang, allergies, preferences, anniversaries, notes,
              visit_count, no_show_count, last_visit_date
       FROM customers WHERE store_id = ? AND id = ?`,
    )
    .bind(storeId, id)
    .first<Record<string, any>>();
  if (!c) return null;
  const { results } = await db
    .prepare(
      `SELECT id, date, start_min AS startMin, party_size AS partySize, course_id AS courseId, status, source
       FROM reservations WHERE store_id = ? AND customer_id = ? ORDER BY date DESC, start_min DESC LIMIT 50`,
    )
    .bind(storeId, id)
    .all();
  return { ...c, anniversaries: parseJson(c.anniversaries, []), history: results };
}

export async function updateCustomer(
  db: D1Database,
  storeId: string,
  id: string,
  patch: Partial<Record<"name" | "kana" | "phone" | "email" | "allergies" | "preferences" | "notes", string | null>> & {
    anniversaries?: { label: string; date: string }[];
  },
): Promise<boolean> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    cols.push(`${k} = ?`);
    vals.push(k === "anniversaries" ? JSON.stringify(v) : v);
  }
  if (cols.length === 0) return true;
  const r = await db
    .prepare(`UPDATE customers SET ${cols.join(", ")}, updated_at = datetime('now') WHERE id = ? AND store_id = ?`)
    .bind(...vals, id, storeId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}
