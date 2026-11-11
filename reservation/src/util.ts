// 入力の整形・確認と、お客様用リンクの鍵を作る関数。

/** 日本の電話番号を国際形式（+81…）にそろえる。番号として不自然なら null */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/[０-９＋]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  if (plus) return `+${digits}`;
  if (digits.startsWith("0")) return `+81${digits.slice(1)}`;
  return `+${digits}`;
}

export function cleanText(input: unknown, max: number): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().slice(0, max);
  return s === "" ? null : s;
}

export function isEmail(s: string | null): boolean {
  return s !== null && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 長さが違っても処理時間が変わらない比較 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

/**
 * 予約確認リンクの鍵。秘密の値と予約 ID から作るので、保存しなくても後のメール（リマインドなど）で同じリンクを出せる。
 * データベースには鍵のハッシュだけが残り、秘密の値がなければ鍵は作れない。
 */
export async function manageToken(secret: string, reservationId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`manage:${reservationId}`)));
  return btoa(String.fromCharCode(...sig.slice(0, 24))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
