// 通知の送信。notifications 表に積まれたものを、送ってよい時刻になったら送る。
// 予約の直後（ctx.waitUntil）と、Cron（5分ごと）の両方から呼ばれる。同じ通知を二重に送らないよう、1件ずつ「送信中」にしてから送る。

import { buildMail, type MailInput, type MailKind } from "./mail";
import { manageToken, sha256Hex } from "./util";

export interface NotifyEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  RESEND_API_URL?: string; // 試験用に差し替えられるようにする
  MAIL_FROM?: string; // 例：reserve@mail.atsurae.jp（送信サービスで認証したドメイン）
  MANAGE_SECRET?: string;
  PUBLIC_BASE_URL?: string; // 例：https://reserve.atsurae.jp
}

export interface OutgoingMail {
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<{ id: string | null }>;
}

export function mailEnabled(env: NotifyEnv): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export function resendMailer(env: NotifyEnv): Mailer {
  return {
    async send(m) {
      const res = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: m.from,
          to: [m.to],
          subject: m.subject,
          text: m.text,
          html: m.html,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(`resend ${res.status}: ${body.message ?? "error"}`);
      return { id: body.id ?? null };
    },
  };
}

const MAX_ATTEMPTS = 3;

interface Row {
  id: string;
  kind: MailKind;
  attempts: number;
  r_id: string;
  r_date: string;
  r_start_min: number;
  r_party_size: number;
  r_status: string;
  r_source: string;
  r_guest_name: string;
  r_guest_note: string | null;
  r_lang: string;
  r_manage_token_hash: string | null;
  c_phone: string | null;
  c_email: string | null;
  c_allergies: string | null;
  c_visit_count: number | null;
  co_name_ja: string | null;
  co_name_en: string | null;
  s_slug: string;
  s_name: string;
  s_name_en: string | null;
  s_phone: string | null;
  s_email: string | null;
  s_theme: string;
  s_policy: string;
}

export interface ProcessResult {
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

/** 送ってよい通知を送る。nowSql は試験用（既定は D1 の現在時刻） */
export async function processNotifications(
  env: NotifyEnv,
  opts: { limit?: number; mailer?: Mailer; nowJst?: { date: string; min: number } } = {},
): Promise<ProcessResult> {
  const db = env.DB;
  const result: ProcessResult = { sent: 0, skipped: 0, failed: 0, retried: 0 };

  // 送信中のまま10分以上たったもの（途中で止まった）は送り直しに戻す
  await db
    .prepare("UPDATE notifications SET status = 'pending' WHERE status = 'sending' AND claimed_at < datetime('now', '-10 minutes')")
    .run();

  const { results: due } = await db
    .prepare("SELECT id FROM notifications WHERE status = 'pending' AND send_after <= datetime('now') ORDER BY send_after LIMIT ?")
    .bind(opts.limit ?? 50)
    .all<{ id: string }>();

  const mailer = opts.mailer ?? (mailEnabled(env) ? resendMailer(env) : null);
  const now = opts.nowJst ?? jstNow();

  for (const { id } of due) {
    // 1件ずつ「送信中」にする。他の処理が先に取っていたら飛ばす
    const claim = await db
      .prepare(
        "UPDATE notifications SET status = 'sending', claimed_at = datetime('now'), attempts = attempts + 1 WHERE id = ? AND status = 'pending'",
      )
      .bind(id)
      .run();
    if ((claim.meta.changes ?? 0) === 0) continue;

    const row = await db
      .prepare(
        `SELECT n.id, n.kind, n.attempts,
                r.id AS r_id, r.date AS r_date, r.start_min AS r_start_min, r.party_size AS r_party_size, r.status AS r_status,
                r.source AS r_source, r.guest_name AS r_guest_name, r.guest_note AS r_guest_note, r.lang AS r_lang,
                r.manage_token_hash AS r_manage_token_hash,
                c.phone AS c_phone, c.email AS c_email, c.allergies AS c_allergies, c.visit_count AS c_visit_count,
                co.name_ja AS co_name_ja, co.name_en AS co_name_en,
                s.slug AS s_slug, s.name AS s_name, s.name_en AS s_name_en, s.phone AS s_phone, s.email AS s_email,
                s.theme AS s_theme, s.policy AS s_policy
         FROM notifications n
         JOIN reservations r ON r.id = n.reservation_id
         JOIN stores s ON s.id = n.store_id
         LEFT JOIN customers c ON c.id = r.customer_id
         LEFT JOIN courses co ON co.id = r.course_id
         WHERE n.id = ?`,
      )
      .bind(id)
      .first<Row>();

    if (!row) {
      await finish(db, id, "skipped", "reservation_missing");
      result.skipped++;
      continue;
    }

    const skip = skipReason(row, now, mailer !== null);
    if (skip) {
      await finish(db, id, "skipped", skip);
      result.skipped++;
      continue;
    }

    const input = await toMailInput(env, row);
    const mail = buildMail(input);
    if (!mail) {
      await finish(db, id, "skipped", row.kind.startsWith("owner") ? "no_store_email" : "no_email");
      result.skipped++;
      continue;
    }

    try {
      const displayName = (row.r_lang === "en" && !row.kind.startsWith("owner") ? row.s_name_en || row.s_name : row.s_name).replace(/["<>]/g, "");
      const sent = await mailer!.send({
        from: `${displayName} <${env.MAIL_FROM}>`,
        to: mail.to,
        replyTo: row.kind.startsWith("owner") ? null : row.s_email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      await db
        .prepare("UPDATE notifications SET status = 'sent', sent_at = datetime('now'), provider_id = ?, error = NULL WHERE id = ?")
        .bind(sent.id, id)
        .run();
      result.sent++;
    } catch (e) {
      const message = String(e instanceof Error ? e.message : e).slice(0, 300);
      if (row.attempts >= MAX_ATTEMPTS) {
        await finish(db, id, "failed", message);
        result.failed++;
      } else {
        // 少し待ってから送り直す（5分、10分…）
        await db
          .prepare(
            "UPDATE notifications SET status = 'pending', error = ?, send_after = datetime('now', ?) WHERE id = ?",
          )
          .bind(message, `+${5 * row.attempts} minutes`, id)
          .run();
        result.retried++;
      }
    }
  }
  return result;
}

/** 送らない理由（送るなら null） */
export function skipReason(row: Pick<Row, "kind" | "r_status" | "r_date" | "r_start_min">, now: { date: string; min: number }, enabled: boolean): string | null {
  if (!enabled) return "mail_disabled";
  const started = row.r_date < now.date || (row.r_date === now.date && row.r_start_min <= now.min);
  switch (row.kind) {
    case "confirm":
    case "owner_new":
      return row.r_status === "cancelled" ? "cancelled" : null;
    case "remind":
      if (row.r_status !== "confirmed") return "not_confirmed";
      return started ? "already_started" : null;
    case "cancel":
    case "owner_cancel":
      return row.r_status === "cancelled" ? null : "not_cancelled";
  }
}

async function toMailInput(env: NotifyEnv, row: Row): Promise<MailInput> {
  const theme = parse<Record<string, string>>(row.s_theme, {});
  const texts = parse<Record<string, any>>(row.s_policy, {}).texts ?? {};
  const base = (env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  // 予約確認リンク：鍵を作り直し、保存されているハッシュと合うときだけ載せる
  let manageUrl: string | null = null;
  if (env.MANAGE_SECRET && row.r_manage_token_hash && (theme.bookingUrl || base)) {
    const token = await manageToken(env.MANAGE_SECRET, row.r_id);
    if ((await sha256Hex(token)) === row.r_manage_token_hash) {
      const page = theme.bookingUrl ? theme.bookingUrl.replace(/\/?$/, "/") : `${base}/r/${encodeURIComponent(row.s_slug)}/`;
      manageUrl = `${page}manage${row.r_lang === "en" ? "?lang=en" : ""}#t=${token}`;
    }
  }

  return {
    kind: row.kind,
    store: {
      name: row.s_name,
      nameEn: row.s_name_en,
      phone: row.s_phone,
      email: row.s_email,
      homepage: theme.homepage ?? null,
      accent: theme.accent ?? null,
      texts,
    },
    reservation: {
      date: row.r_date,
      startMin: row.r_start_min,
      partySize: row.r_party_size,
      guestName: row.r_guest_name,
      guestNote: row.r_guest_note,
      source: row.r_source,
      lang: row.r_lang,
    },
    course: row.co_name_ja ? { ja: row.co_name_ja, en: row.co_name_en ?? row.co_name_ja } : null,
    customer: row.c_visit_count !== null
      ? { phone: row.c_phone, email: row.c_email, allergies: row.c_allergies, visitCount: row.c_visit_count ?? 0 }
      : null,
    manageUrl,
    adminUrl: base ? `${base}/admin/#day/${row.r_date}` : null,
  };
}

async function finish(db: D1Database, id: string, status: "skipped" | "failed", error: string) {
  await db.prepare("UPDATE notifications SET status = ?, error = ? WHERE id = ?").bind(status, error, id).run();
}

function parse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function jstNow() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
