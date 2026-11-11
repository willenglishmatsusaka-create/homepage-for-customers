// 店主・スタッフのログイン。メールで届くリンクか6桁のコードで入り、端末にはクッキーで30日間ログインしたままにする。
// どの店の台帳を見られるかは store_users（店ごとのメールアドレスと役割）で決める。

import { buildLoginMail } from "./mail";
import { mailEnabled, type NotifyEnv, resendMailer } from "./notify";
import { randomToken, sha256Hex } from "./util";

export const SESSION_COOKIE = "ledger_session";
const SESSION_DAYS = 30;
const LOGIN_MINUTES = 15;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_CODE_ATTEMPTS = 5;

export interface AuthEnv extends NotifyEnv {
  DEV_LOGIN_LINKS?: string; // "true" のとき、メールの代わりにログイン用リンクを Worker のログに出す（手元の開発用）
}

export type Role = "owner" | "staff";

export const normalizeEmail = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const e = s.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
};

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export type LoginRequestResult = "sent" | "unknown_email" | "rate_limited" | "mail_disabled";

/**
 * ログイン用のメールを送る。登録のないアドレスでも、画面には同じ返事を出す（登録の有無を外から調べられないように）。
 */
export async function requestLogin(env: AuthEnv, email: string, origin: string): Promise<LoginRequestResult> {
  const db = env.DB;
  const dev = env.DEV_LOGIN_LINKS === "true";
  // 送信の設定がないときは、アドレスの登録の有無にかかわらず同じ答えを返す
  if (!dev && !mailEnabled(env)) return "mail_disabled";
  const { results: stores } = await db
    .prepare("SELECT s.name FROM store_users u JOIN stores s ON s.id = u.store_id WHERE u.email = ? ORDER BY s.name")
    .bind(email)
    .all<{ name: string }>();
  if (stores.length === 0) return "unknown_email";

  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > datetime('now', '-1 hour')")
    .bind(email)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_REQUESTS_PER_HOUR) return "rate_limited";

  const id = `lt_${crypto.randomUUID()}`;
  const token = randomToken();
  const code = sixDigits();
  await db
    .prepare(
      `INSERT INTO login_tokens (id, email, token_hash, code_hash, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '+${LOGIN_MINUTES} minutes'))`,
    )
    .bind(id, email, await sha256Hex(token), await sha256Hex(`${id}:${code}`))
    .run();

  // リンクの鍵は # 以降に置く（サーバーの記録や他サイトへの参照元に残さない）
  const link = `${(env.PUBLIC_BASE_URL || origin).replace(/\/+$/, "")}/admin/#login=${token}`;

  if (dev) {
    console.log(`[dev] login for ${email}: ${link} code=${code}`);
    return "sent";
  }
  const mail = buildLoginMail({ to: email, link, code, storeNames: stores.map((s) => s.name) });
  await resendMailer(env).send({
    from: `予約台帳 <${env.MAIL_FROM}>`,
    to: mail.to,
    replyTo: null,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return "sent";
}

/** リンクの鍵、またはメールアドレスと6桁のコードを確かめて、ログイン中の端末を作る。成功したらクッキーの値を返す */
export async function verifyLogin(
  env: AuthEnv,
  input: { token: string } | { email: string; code: string },
  userAgent: string | null,
): Promise<{ sessionId: string; email: string } | null> {
  const db = env.DB;
  let row: { id: string; email: string; code_hash: string; attempts: number } | null;

  if ("token" in input) {
    row = await db
      .prepare(
        "SELECT id, email, code_hash, attempts FROM login_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')",
      )
      .bind(await sha256Hex(input.token))
      .first();
    if (!row) return null;
  } else {
    if (!/^\d{6}$/.test(input.code)) return null;
    row = await db
      .prepare(
        `SELECT id, email, code_hash, attempts FROM login_tokens
         WHERE email = ? AND used_at IS NULL AND expires_at > datetime('now')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(input.email)
      .first();
    if (!row || row.attempts >= MAX_CODE_ATTEMPTS) return null;
    await db.prepare("UPDATE login_tokens SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    if ((await sha256Hex(`${row.id}:${input.code}`)) !== row.code_hash) return null;
  }

  // 1回だけ使える（同時に2回使われても、先に印を付けた方だけが通る）
  const used = await db
    .prepare("UPDATE login_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL")
    .bind(row.id)
    .run();
  if ((used.meta.changes ?? 0) === 0) return null;

  const sessionId = randomToken();
  await db
    .prepare(
      `INSERT INTO sessions (id_hash, email, user_agent, expires_at) VALUES (?, ?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
    )
    .bind(await sha256Hex(sessionId), row.email, userAgent?.slice(0, 200) ?? null)
    .run();
  return { sessionId, email: row.email };
}

/** クッキーの値からログイン中の人を探す。使っているあいだは期限を延ばす */
export async function getSession(env: AuthEnv, sessionId: string | undefined): Promise<{ email: string } | null> {
  if (!sessionId) return null;
  const db = env.DB;
  const hash = await sha256Hex(sessionId);
  const row = await db
    .prepare(
      "SELECT email, last_seen_at < datetime('now', '-1 day') AS stale FROM sessions WHERE id_hash = ? AND expires_at > datetime('now')",
    )
    .bind(hash)
    .first<{ email: string; stale: number }>();
  if (!row) return null;
  if (row.stale) {
    await db
      .prepare(`UPDATE sessions SET last_seen_at = datetime('now'), expires_at = datetime('now', '+${SESSION_DAYS} days') WHERE id_hash = ?`)
      .bind(hash)
      .run();
  }
  return { email: row.email };
}

export async function endSession(env: AuthEnv, sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(sessionId)).run();
}

export async function roleFor(db: D1Database, storeId: string, email: string): Promise<Role | null> {
  const row = await db
    .prepare("SELECT role FROM store_users WHERE store_id = ? AND email = ?")
    .bind(storeId, email)
    .first<{ role: Role }>();
  return row?.role ?? null;
}

export async function storesFor(db: D1Database, email: string) {
  const { results } = await db
    .prepare("SELECT s.slug, s.name, u.role FROM store_users u JOIN stores s ON s.id = u.store_id WHERE u.email = ? ORDER BY s.name")
    .bind(email)
    .all<{ slug: string; name: string; role: Role }>();
  return results;
}

export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86400;
