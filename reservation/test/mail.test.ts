import { describe, expect, it } from "vitest";
import { buildMail, formatDate, type MailInput } from "../src/mail";
import { skipReason } from "../src/notify";
import { manageToken, sha256Hex } from "../src/util";

const base = (p: Partial<MailInput> = {}): MailInput => ({
  kind: "confirm",
  store: {
    name: "BIEN MANGER", nameEn: "BIEN MANGER", phone: "075-275-1080", email: "owner@example.com",
    homepage: "https://bien-manger.jp/", accent: "#7f2a37",
    texts: { cancelPolicy: { ja: "お早めにご連絡ください。", en: "Please let us know early." }, notices: { ja: ["全席禁煙です。"], en: ["Non-smoking."] } },
  },
  reservation: { date: "2026-12-03", startMin: 1080, partySize: 2, guestName: "山田 花子", guestNote: "結婚記念日<です>", source: "web", lang: "ja" },
  course: { ja: "ディナーコース", en: "Dinner course" },
  customer: { phone: "+819012345678", email: "hanako@example.com", allergies: "甲殻類", visitCount: 0 },
  manageUrl: "https://reserve.example/r/bien-manger/manage#t=abc",
  adminUrl: "https://reserve.example/admin/#day/2026-12-03",
  ...p,
});

describe("buildMail", () => {
  it("確定メール（日本語）に日時・人数・コース・アレルギー・確認リンク・案内が入る", () => {
    const m = buildMail(base())!;
    expect(m.to).toBe("hanako@example.com");
    expect(m.subject).toBe("【BIEN MANGER】ご予約を承りました（12月3日（木） 18:00）");
    for (const s of ["山田 花子 様", "2026年12月3日（木） 18:00", "2名", "ディナーコース", "甲殻類", "manage#t=abc", "全席禁煙です。", "お早めにご連絡ください。", "075-275-1080"]) {
      expect(m.text).toContain(s);
    }
    expect(m.html).toContain("結婚記念日&lt;です&gt;"); // HTML に入れる文字は必ず置き換える
    expect(m.html).not.toContain("<です>");
  });

  it("英語で予約した人には英語で、日本時間と国際番号で送る", () => {
    const m = buildMail(base({ reservation: { ...base().reservation, lang: "en", guestName: "Emily Carter" } }))!;
    expect(m.subject).toBe("BIEN MANGER: your reservation is confirmed (Thursday, December 3, 2026, 18:00)");
    expect(m.text).toContain("Dear Emily Carter,");
    expect(m.text).toContain("(Japan time)");
    expect(m.text).toContain("+81 75-275-1080");
    expect(m.text).toContain("Dinner course");
  });

  it("リマインドとキャンセルの件名。キャンセルには確認リンクや案内を載せない", () => {
    expect(buildMail(base({ kind: "remind" }))!.subject).toContain("明日のご予約のご案内");
    const c = buildMail(base({ kind: "cancel" }))!;
    expect(c.subject).toContain("キャンセルを承りました");
    expect(c.text).not.toContain("manage#t=");
    expect(c.text).not.toContain("全席禁煙");
  });

  it("確認リンクが作れないときは載せない", () => {
    expect(buildMail(base({ manageUrl: null }))!.text).not.toContain("ご予約の確認・キャンセル：");
  });

  it("お店向けは日本語で、経路・連絡先・台帳へのリンクが入る", () => {
    const m = buildMail(base({ kind: "owner_new", reservation: { ...base().reservation, lang: "en" } }))!;
    expect(m.to).toBe("owner@example.com");
    expect(m.subject).toBe("［新しい予約］12月3日（木） 18:00 2名 山田 花子 様（ネット）");
    expect(m.text).not.toContain("お店に届きます");
    for (const s of ["090-1234-5678", "hanako@example.com", "甲殻類", "はじめて", "英語でのご予約", "#day/2026-12-03"]) expect(m.text).toContain(s);
    expect(buildMail(base({ kind: "owner_cancel" }))!.subject.startsWith("［キャンセル］")).toBe(true);
  });

  it("宛先がなければ作らない", () => {
    expect(buildMail(base({ customer: { phone: null, email: null, allergies: null, visitCount: 0 } }))).toBeNull();
    expect(buildMail(base({ kind: "owner_new", store: { ...base().store, email: null } }))).toBeNull();
  });

  it("日付の書き方", () => {
    expect(formatDate("2027-01-01", "ja")).toBe("2027年1月1日（金）");
    expect(formatDate("2027-01-01", "en")).toBe("Friday, January 1, 2027");
  });
});

describe("skipReason", () => {
  const now = { date: "2026-12-02", min: 600 };
  const row = (p: Partial<Parameters<typeof skipReason>[0]>) => ({ kind: "remind" as const, r_status: "confirmed", r_date: "2026-12-03", r_start_min: 1080, ...p });
  it("送信の設定がなければ送らない", () => expect(skipReason(row({}), now, false)).toBe("mail_disabled"));
  it("予約中ならリマインドを送る", () => expect(skipReason(row({}), now, true)).toBeNull());
  it("キャンセル済み・始まった後はリマインドを送らない", () => {
    expect(skipReason(row({ r_status: "cancelled" }), now, true)).toBe("not_confirmed");
    expect(skipReason(row({ r_date: "2026-12-02", r_start_min: 600 }), now, true)).toBe("already_started");
  });
  it("確定メールは、送る前にキャンセルされていたら送らない", () => {
    expect(skipReason(row({ kind: "confirm", r_status: "cancelled" }), now, true)).toBe("cancelled");
    expect(skipReason(row({ kind: "confirm" }), now, true)).toBeNull();
  });
  it("キャンセルのメールは、予約に戻されていたら送らない", () => {
    expect(skipReason(row({ kind: "cancel", r_status: "confirmed" }), now, true)).toBe("not_cancelled");
    expect(skipReason(row({ kind: "cancel", r_status: "cancelled" }), now, true)).toBeNull();
  });
});

describe("manageToken", () => {
  it("同じ秘密と予約なら同じ鍵、違えば違う鍵", async () => {
    const a = await manageToken("secret", "rs_1");
    expect(a).toBe(await manageToken("secret", "rs_1"));
    expect(a).not.toBe(await manageToken("secret", "rs_2"));
    expect(a).not.toBe(await manageToken("other", "rs_1"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await sha256Hex(a)).toHaveLength(64);
  });
});

describe("buildLoginMail", () => {
  it("コードと期限とリンクが入り、ホーム画面のアプリではコードを使うよう案内する", async () => {
    const { buildLoginMail } = await import("../src/mail");
    const m = buildLoginMail({ to: "owner@example.com", link: "https://r.example/admin/#login=abc", code: "012345", storeNames: ["BIEN MANGER"] });
    expect(m.subject).toBe("台帳へのログイン（コード 012345）");
    for (const s of ["BIEN MANGER の予約台帳", "012345", "15分", "#login=abc", "ホーム画面に追加", "心当たりがない"]) expect(m.text).toContain(s);
    expect(m.text).not.toContain("お店に届きます");
  });
});
