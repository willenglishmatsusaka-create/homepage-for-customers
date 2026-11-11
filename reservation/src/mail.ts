// メールの文面。D1 にも送信サービスにも依存しない純粋な関数だけを置く。
// お客様向け（確定・前日リマインド・キャンセル）は予約時の言葉で、お店向け（新着・キャンセル）は日本語で送る。

export type MailKind = "confirm" | "remind" | "cancel" | "owner_new" | "owner_cancel";
type Lang = "ja" | "en";

export interface MailInput {
  kind: MailKind;
  store: {
    name: string;
    nameEn: string | null;
    phone: string | null;
    email: string | null;
    homepage: string | null;
    accent: string | null;
    texts: { cancelPolicy?: { ja?: string; en?: string }; notices?: { ja?: string[]; en?: string[] } };
  };
  reservation: {
    date: string;
    startMin: number;
    partySize: number;
    guestName: string;
    guestNote: string | null;
    source: string;
    lang: string;
  };
  course: { ja: string; en: string } | null;
  customer: { phone: string | null; email: string | null; allergies: string | null; visitCount: number } | null;
  manageUrl: string | null;
  adminUrl: string | null;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Block =
  | { t: "p"; text: string }
  | { t: "kv"; rows: [string, string][] }
  | { t: "link"; label: string; url: string }
  | { t: "list"; title: string; items: string[] }
  | { t: "box"; title: string; text: string };

const SOURCE_JA: Record<string, string> = {
  web: "ネット", phone: "電話", walkin: "来店", tablecheck: "TableCheck", ikyu: "一休", tabelog: "食べログ", other: "その他",
};
const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];
const DOW_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const time = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function formatDate(date: string, lang: Lang): string {
  const [y, m, d] = date.split("-").map(Number);
  return lang === "ja" ? `${y}年${m}月${d}日（${DOW_JA[dow(date)]}）` : `${DOW_EN[dow(date)]}, ${MON_EN[m - 1]} ${d}, ${y}`;
}
const shortDateJa = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日（${DOW_JA[dow(date)]}）`;
};
const intlTel = (tel: string) => (tel.startsWith("0") ? `+81 ${tel.slice(1)}` : tel);
/** +819012345678 → 090-1234-5678（日本の番号だけ） */
export function localPhone(p: string): string {
  if (!p.startsWith("+81")) return p;
  const d = `0${p.slice(3)}`;
  if (/^0[789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0[36]\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/** 宛先がない・送る必要がないときは null */
export function buildMail(input: MailInput): MailMessage | null {
  const { kind, store, reservation: r } = input;
  if (kind === "owner_new" || kind === "owner_cancel") {
    if (!store.email) return null;
    return render(store.email, ownerSubject(input), ownerBlocks(input), store, "ja", true);
  }
  const to = input.customer?.email;
  if (!to) return null;
  const lang: Lang = r.lang === "en" ? "en" : "ja";
  return render(to, guestSubject(input, lang), guestBlocks(input, lang), store, lang);
}

// ---------- お客様向け ----------

function storeName(input: MailInput, lang: Lang) {
  return lang === "en" ? input.store.nameEn || input.store.name : input.store.name;
}

function guestSubject(input: MailInput, lang: Lang): string {
  const name = storeName(input, lang);
  const r = input.reservation;
  const when = lang === "ja" ? `${shortDateJa(r.date)} ${time(r.startMin)}` : `${formatDate(r.date, "en")}, ${time(r.startMin)}`;
  if (lang === "ja") {
    return {
      confirm: `【${name}】ご予約を承りました（${when}）`,
      remind: `【${name}】明日のご予約のご案内（${when}）`,
      cancel: `【${name}】ご予約のキャンセルを承りました（${when}）`,
    }[input.kind as "confirm" | "remind" | "cancel"];
  }
  return {
    confirm: `${name}: your reservation is confirmed (${when})`,
    remind: `${name}: see you tomorrow (${when})`,
    cancel: `${name}: your reservation has been cancelled (${when})`,
  }[input.kind as "confirm" | "remind" | "cancel"];
}

function details(input: MailInput, lang: Lang): [string, string][] {
  const r = input.reservation;
  const rows: [string, string][] = lang === "ja"
    ? [["日時", `${formatDate(r.date, "ja")} ${time(r.startMin)}`], ["人数", `${r.partySize}名`]]
    : [["Date & time", `${formatDate(r.date, "en")}, ${time(r.startMin)} (Japan time)`], ["Guests", `${r.partySize}`]];
  if (input.course) rows.push([lang === "ja" ? "コース" : "Course", input.course[lang]]);
  rows.push([lang === "ja" ? "お名前" : "Name", lang === "ja" ? `${r.guestName} 様` : r.guestName]);
  if (input.customer?.allergies) rows.push([lang === "ja" ? "アレルギー" : "Allergies", input.customer.allergies]);
  if (r.guestNote) rows.push([lang === "ja" ? "ご要望" : "Requests", r.guestNote]);
  return rows;
}

function guestBlocks(input: MailInput, lang: Lang): Block[] {
  const { store, reservation: r } = input;
  const name = storeName(input, lang);
  const tel = store.phone ? (lang === "ja" ? store.phone : intlTel(store.phone)) : null;
  const blocks: Block[] = [];
  const ja = lang === "ja";

  blocks.push({ t: "p", text: ja ? `${r.guestName} 様` : `Dear ${r.guestName},` });
  if (input.kind === "confirm") {
    blocks.push({ t: "p", text: ja
      ? `このたびは ${name} をご予約いただき、ありがとうございます。以下の内容でご予約を承りました。`
      : `Thank you for booking with ${name}. Your reservation is confirmed as follows.` });
  } else if (input.kind === "remind") {
    blocks.push({ t: "p", text: ja
      ? `明日のご予約のご案内です。お目にかかれるのを楽しみにしております。`
      : `This is a reminder of your reservation tomorrow. We look forward to welcoming you.` });
  } else {
    blocks.push({ t: "p", text: ja
      ? `以下のご予約のキャンセルを承りました。またのご来店を心よりお待ちしております。`
      : `Your reservation below has been cancelled. We hope to welcome you another time.` });
  }
  blocks.push({ t: "kv", rows: details(input, lang) });

  if (input.kind !== "cancel") {
    if (input.manageUrl) {
      blocks.push({ t: "link", label: ja ? "ご予約の確認・キャンセル" : "View or cancel your reservation", url: input.manageUrl });
    }
    const notices = store.texts.notices?.[lang] ?? [];
    if (notices.length) blocks.push({ t: "list", title: ja ? "ご来店にあたって" : "Before your visit", items: notices });
    const policy = store.texts.cancelPolicy?.[lang];
    if (policy) blocks.push({ t: "box", title: ja ? "変更・キャンセルについて" : "Changes and cancellations", text: policy });
    blocks.push({ t: "p", text: ja
      ? `日時や人数の変更は、お電話でご連絡ください。${tel ? `（${tel}）` : ""}`
      : `To change the date, time or number of guests, please call us${tel ? ` at ${tel}` : ""}.` });
  }
  return blocks;
}

// ---------- お店向け ----------

function ownerSubject(input: MailInput): string {
  const r = input.reservation;
  const head = input.kind === "owner_new" ? "新しい予約" : "キャンセル";
  return `［${head}］${shortDateJa(r.date)} ${time(r.startMin)} ${r.partySize}名 ${r.guestName} 様（${SOURCE_JA[r.source] ?? r.source}）`;
}

function ownerBlocks(input: MailInput): Block[] {
  const r = input.reservation;
  const c = input.customer;
  const rows: [string, string][] = [
    ["日時", `${formatDate(r.date, "ja")} ${time(r.startMin)}`],
    ["人数", `${r.partySize}名`],
    ["お名前", `${r.guestName} 様`],
    ["経路", SOURCE_JA[r.source] ?? r.source],
  ];
  if (input.course) rows.push(["コース", input.course.ja]);
  if (c?.phone) rows.push(["電話", localPhone(c.phone)]);
  if (c?.email) rows.push(["メール", c.email]);
  if (c?.allergies) rows.push(["アレルギー", c.allergies]);
  if (r.guestNote) rows.push(["ご要望", r.guestNote]);
  if (c) rows.push(["来店", c.visitCount > 0 ? `${c.visitCount}回` : "はじめて"]);
  if (r.lang === "en") rows.push(["言葉", "英語でのご予約"]);
  const blocks: Block[] = [
    { t: "p", text: input.kind === "owner_new" ? "新しい予約が入りました。" : "お客様が予約をキャンセルしました。" },
    { t: "kv", rows },
  ];
  if (input.adminUrl) blocks.push({ t: "link", label: "台帳で見る", url: input.adminUrl });
  return blocks;
}

// ---------- 書き出し（テキストと HTML を同じ内容から作る） ----------

function render(to: string, subject: string, blocks: Block[], store: MailInput["store"], lang: Lang, forOwner = false): MailMessage {
  const name = lang === "en" ? store.nameEn || store.name : store.name;
  const tel = store.phone ? (lang === "ja" ? store.phone : intlTel(store.phone)) : null;
  const footer = [name, tel, store.homepage].filter(Boolean) as string[];
  const replyNote = forOwner
    ? "このメールは予約の仕組み（ATSURAE）から自動でお送りしています。"
    : store.email
    ? (lang === "ja" ? "このメールにご返信いただくと、お店に届きます。" : "Replies to this email go to the restaurant.")
    : (lang === "ja" ? "このメールは送信専用です。お問い合わせはお電話でお願いいたします。" : "This address does not receive replies. Please call us with any questions.");

  // テキスト
  const textParts = blocks.map((b) => {
    switch (b.t) {
      case "p": return b.text;
      case "kv": return b.rows.map(([k, v]) => `${k}：${v}`).join("\n");
      case "link": return `${b.label}：\n${b.url}`;
      case "list": return `【${b.title}】\n${b.items.map((i) => `・${i}`).join("\n")}`;
      case "box": return `【${b.title}】\n${b.text}`;
    }
  });
  const text = `${textParts.join("\n\n")}\n\n──────────\n${footer.join("\n")}\n\n${replyNote}\n`;

  // HTML（メールソフト向けに表組みとインラインの見た目で書く）
  const accent = store.accent && /^#[0-9a-f]{3,8}$/i.test(store.accent) ? store.accent : "#2c2b29";
  const e = escapeHtml;
  const htmlParts = blocks.map((b) => {
    switch (b.t) {
      case "p": return `<p style="margin:0 0 16px">${e(b.text)}</p>`;
      case "kv": return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;border-top:1px solid #dcd8d1">${b.rows.map(([k, v]) =>
        `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #dcd8d1;color:#6b6862;font-size:13px;white-space:nowrap;vertical-align:top;width:7em">${e(k)}</td><td style="padding:10px 0;border-bottom:1px solid #dcd8d1;white-space:pre-wrap">${e(v)}</td></tr>`).join("")}</table>`;
      case "link": return `<p style="margin:0 0 24px"><a href="${e(b.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:2px;letter-spacing:.06em">${e(b.label)}</a></p>`;
      case "list": return `<p style="margin:0 0 6px;font-weight:600">${e(b.title)}</p><ul style="margin:0 0 18px;padding-left:1.2em;color:#4a4843">${b.items.map((i) => `<li style="margin:0 0 4px">${e(i)}</li>`).join("")}</ul>`;
      case "box": return `<div style="margin:0 0 18px;padding:12px 16px;background:#f3f1ed;border:1px solid #dcd8d1"><p style="margin:0 0 4px;font-weight:600">${e(b.title)}</p><p style="margin:0">${e(b.text)}</p></div>`;
    }
  });
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#e9e7e3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e7e3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;color:#2c2b29;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',Meiryo,sans-serif;font-size:15px;line-height:1.8">
<tr><td style="padding:28px 28px 8px;border-bottom:3px solid ${accent}"><div style="font-family:'Times New Roman',serif;font-size:20px;letter-spacing:.24em">${e(name)}</div></td></tr>
<tr><td style="padding:24px 28px 8px">${htmlParts.join("\n")}</td></tr>
<tr><td style="padding:16px 28px 28px;border-top:1px solid #dcd8d1;font-size:13px;color:#6b6862">${footer.map((f) => (f.startsWith("http") ? `<a href="${e(f)}" style="color:#6b6862">${e(f)}</a>` : e(f))).join("<br>")}<br><br>${e(replyNote)}</td></tr>
</table></td></tr></table></body></html>`;

  return { to, subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
