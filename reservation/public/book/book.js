// 予約ページ（お客様向け）
// URL：/r/<店舗>/（?lang=en で英語）、予約の確認・キャンセルは /r/<店舗>/manage#t=<鍵>
// 流れ：① 人数と日付 → ② 時間とコース → ③ お客様情報 → ④ 確認 → 完了

const $app = document.getElementById("app");
const slug = decodeURIComponent(location.pathname.split("/")[2] || "");
const isManage = /\/manage\/?$/.test(location.pathname);

// ---------- 言葉 ----------

const T = {
  ja: {
    langSwitch: "English", eyebrow: "Reservation", title: "ご予約", manageTitle: "ご予約の確認",
    steps: ["日付", "時間・コース", "お客様情報", "確認"],
    party: "人数", partyUnit: "名", partyMore: (n, tel) => `${n + 1}名様以上のご予約は、お電話でお問い合わせください${tel ? `（<a href="tel:${tel}">${tel}</a>）` : ""}。`,
    date: "日付", dow: ["日", "月", "火", "水", "木", "金", "土"], monthTitle: (y, m) => `${y}年${m}月`,
    available: "空きあり", full: "満席", closed: "休", legendOk: "○ ご予約いただけます", legendNo: "数字のみ：満席・休業日",
    prevMonth: "前の月", nextMonth: "次の月",
    timeCourse: "時間とコース", time: "時間", course: "コース", change: "変更する", noSlots: "この日はご予約いただける時間がありません。別の日をお選びください。",
    jst: "", perPerson: (p) => `お一人様 ${p.toLocaleString()}円（税込）`, seatOnly: "お席のみのご予約",
    info: "お客様情報", name: "お名前", namePh: "山田 花子", kana: "ふりがな", kanaPh: "やまだ はなこ",
    phone: "電話番号", phonePh: "090-1234-5678", phoneHint: "当日ご連絡がつく番号をお書きください。",
    email: "メールアドレス", emailPh: "hanako@example.com",
    allergies: "アレルギー・苦手な食材", allergiesPh: "例：甲殻類、生の玉ねぎ",
    note: "ご要望", notePh: "例：記念日のお祝い、ベビーカーで伺います",
    required: "必須", errName: "お名前をお書きください。", errPhone: "電話番号をお確かめください。", errEmail: "メールアドレスをお確かめください。", errAgree: "ご確認のうえ、チェックを入れてください。",
    notices: "ご来店にあたって", cancelPolicy: "変更・キャンセルについて", agree: "上記の内容を確認しました",
    toConfirm: "確認へ進む", next: "次へ", back: "戻る",
    confirm: "ご予約内容の確認", dateTime: "日時", partyLabel: "人数", contact: "ご連絡先",
    submit: "この内容で予約する", sending: "送信しています…",
    done: "ご予約を承りました", doneLead: (name) => `${name}様、ご予約ありがとうございます。当日お目にかかれるのを楽しみにしております。`,
    doneEmail: "ご予約の内容をメールでお送りしました。",
    manageLink: "ご予約の確認・キャンセルはこちらのページから行えます。このページを保存してください。",
    copy: "コピー", copied: "コピーしました", addCal: "カレンダーに追加", openManage: "ご予約の確認ページを開く", home: "ホームページへ戻る",
    status: { confirmed: "ご予約中", seated: "ご来店中", done: "ご来店済み", cancelled: "キャンセル済み", no_show: "キャンセル済み" },
    cancel: "予約をキャンセルする", cancelAsk: "このご予約をキャンセルしますか？", cancelYes: "キャンセルする", cancelNo: "やめる",
    cancelled: "ご予約をキャンセルしました。またのご利用をお待ちしております。",
    changeByPhone: (tel) => `日時や人数の変更は、お電話でご連絡ください${tel ? `（<a href="tel:${tel}">${tel}</a>）` : ""}。`,
    notFound: "ご予約が見つかりませんでした。リンクが正しいかお確かめください。",
    storeNotFound: "ページが見つかりません。",
    netError: "通信できませんでした。電波の状態をお確かめのうえ、もう一度お試しください。",
    turnstile: "ロボットでないことの確認が終わっていません。少し待ってから、もう一度お試しください。",
    tel: "お電話", dateFmt: (y, m, d, w) => `${y}年${m}月${d}日（${w}）`,
    partyFmt: (n) => `${n}名`,
  },
  en: {
    langSwitch: "日本語", eyebrow: "Reservation", title: "Book a table", manageTitle: "Your reservation",
    steps: ["Date", "Time & course", "Your details", "Confirm"],
    party: "Guests", partyUnit: "", partyMore: (n, tel) => `For parties of ${n + 1} or more, please call us${tel ? ` at <a href="tel:${tel}">${intlTel(tel)}</a>` : ""}.`,
    date: "Date", dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    monthTitle: (y, m) => `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`,
    available: "Open", full: "Full", closed: "Closed", legendOk: "○ Available", legendNo: "Number only: full or closed",
    prevMonth: "Previous month", nextMonth: "Next month",
    timeCourse: "Time & course", time: "Time", course: "Course", change: "Change", noSlots: "No times are available on this day. Please choose another date.",
    jst: "All times are Japan time.", perPerson: (p) => `¥${p.toLocaleString()} per person (tax incl.)`, seatOnly: "Table only",
    info: "Your details", name: "Full name", namePh: "Hanako Yamada", kana: "", kanaPh: "",
    phone: "Phone number", phonePh: "+1 415 555 0100", phoneHint: "Include the country code if you are calling from outside Japan.",
    email: "Email", emailPh: "you@example.com",
    allergies: "Allergies or dislikes", allergiesPh: "e.g. shellfish, raw onion",
    note: "Requests", notePh: "e.g. anniversary, arriving with a stroller",
    required: "Required", errName: "Please enter your name.", errPhone: "Please check your phone number.", errEmail: "Please check your email address.", errAgree: "Please confirm before continuing.",
    notices: "Before your visit", cancelPolicy: "Changes and cancellations", agree: "I have read the above",
    toConfirm: "Review booking", next: "Next", back: "Back",
    confirm: "Review your booking", dateTime: "Date & time", partyLabel: "Guests", contact: "Contact",
    submit: "Confirm booking", sending: "Sending…",
    done: "Your table is booked", doneLead: (name) => `Thank you, ${name}. We look forward to welcoming you.`,
    doneEmail: "We have emailed you the details of your booking.",
    manageLink: "You can check or cancel your booking on this page. Please save the link.",
    copy: "Copy", copied: "Copied", addCal: "Add to calendar", openManage: "Open my booking", home: "Back to the website",
    status: { confirmed: "Confirmed", seated: "Seated", done: "Visited", cancelled: "Cancelled", no_show: "Cancelled" },
    cancel: "Cancel this booking", cancelAsk: "Do you want to cancel this booking?", cancelYes: "Yes, cancel", cancelNo: "Keep booking",
    cancelled: "Your booking has been cancelled. We hope to see you another time.",
    changeByPhone: (tel) => `To change the date, time or number of guests, please call us${tel ? ` at <a href="tel:${tel}">${intlTel(tel)}</a>` : ""}.`,
    notFound: "We could not find this booking. Please check the link.",
    storeNotFound: "Page not found.",
    netError: "We could not connect. Please check your connection and try again.",
    turnstile: "The security check has not finished. Please wait a moment and try again.",
    tel: "Phone", dateFmt: (y, m, d, w) => `${w}, ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}, ${y}`,
    partyFmt: (n) => `${n} ${n === 1 ? "guest" : "guests"}`,
  },
};

const params = new URLSearchParams(location.search);
let lang = params.get("lang") === "en" ? "en" : "ja";
let t = T[lang];

// ---------- 状態 ----------

const s = {
  config: null,
  step: 1,
  party: 2,
  month: null, // "YYYY-MM"
  calendar: new Map(), // "party|YYYY-MM" → days
  date: null,
  slots: null,
  startMin: null,
  periodId: null,
  courseId: undefined, // null は「席のみ」
  form: { name: "", kana: "", phone: "", email: "", allergies: "", note: "" },
  agree: false,
  alert: "",
  result: null,
  turnstileToken: "",
};

// ---------- 道具 ----------

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const wd = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fmtDate = (d) => { const [y, m, dd] = d.split("-").map(Number); return t.dateFmt(y, m, dd, t.dow[wd(d)]); };
function intlTel(tel) { return tel?.startsWith("0") ? `+81 ${tel.slice(1)}` : tel; }
const ICON = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

const courseName = (id) => {
  const c = s.config.courses.find((x) => x.id === id);
  return c ? (lang === "en" ? c.nameEn : c.nameJa) : t.seatOnly;
};
const periodName = (id) => {
  const p = s.config.periods.find((x) => x.id === id);
  return p ? (lang === "en" ? p.nameEn : p.nameJa) : "";
};
const storeName = () => (lang === "en" ? s.config.store.nameEn || s.config.store.name : s.config.store.name);

class ApiError extends Error {
  constructor(status, data) { super(data?.error || String(status)); this.status = status; this.data = data; }
}
async function api(path, opts = {}) {
  const res = await fetch(`/api/${encodeURIComponent(slug)}${path}`, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---------- 店舗の見た目 ----------

function applyTheme(theme = {}) {
  const map = { accent: "--accent", accentHover: "--accent-hover", accentInk: "--accent-ink", background: "--bg", surface: "--surface", ink: "--ink", inkDim: "--ink-dim", line: "--line" };
  const safe = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
  for (const [k, v] of Object.entries(map)) if (theme[k] && safe.test(theme[k])) document.documentElement.style.setProperty(v, theme[k]);
  if (theme.heading === "sans") document.documentElement.style.setProperty("--heading", "var(--sans)");
}

function renderChrome() {
  document.documentElement.lang = lang;
  const st = s.config.store;
  document.title = `${isManage ? t.manageTitle : t.title} | ${storeName()}`;
  document.getElementById("brand-name").textContent = storeName();
  document.getElementById("brand-sub").textContent = st.theme?.logoSub || "";
  const brand = document.getElementById("brand");
  if (st.theme?.homepage) brand.href = lang === "en" ? new URL("en/", st.theme.homepage).href : st.theme.homepage;
  else brand.removeAttribute("href");
  const langBtn = document.getElementById("lang");
  langBtn.textContent = t.langSwitch;
  langBtn.lang = lang === "ja" ? "en" : "ja";
  const tel = st.phone;
  document.getElementById("foot").innerHTML = `
    <div>${esc(storeName())}${tel ? `　${t.tel} <a href="tel:${esc(tel)}">${esc(lang === "en" ? intlTel(tel) : tel)}</a>` : ""}</div>
    <div class="powered">Reservations by ATSURAE</div>`;
}

document.getElementById("lang").addEventListener("click", () => {
  lang = lang === "ja" ? "en" : "ja";
  t = T[lang];
  const u = new URL(location.href);
  if (lang === "en") u.searchParams.set("lang", "en"); else u.searchParams.delete("lang");
  history.replaceState(null, "", u);
  renderChrome();
  render();
});

// ---------- 画面 ----------

function header(title = t.title) {
  return `<div class="title"><div class="eyebrow">${t.eyebrow}</div><h1>${esc(title)}</h1></div>`;
}

function stepper() {
  return `<ol class="steps" aria-label="${lang === "ja" ? "予約の手順" : "Booking steps"}">${t.steps.map((label, i) =>
    `<li class="${i + 1 < s.step ? "done" : i + 1 === s.step ? "now" : ""}" ${i + 1 === s.step ? 'aria-current="step"' : ""}>${esc(label)}</li>`).join("")}</ol>`;
}

const alertBox = () => (s.alert ? `<div class="alert" role="alert">${esc(s.alert)}</div>` : "");

function render() {
  if (!s.config) return;
  if (isManage) return renderManage();
  if (s.step === 5) return renderDone();
  const body = { 1: stepDate, 2: stepTime, 3: stepInfo, 4: stepConfirm }[s.step]();
  $app.innerHTML = header() + stepper() + alertBox() + body;
  afterRender();
}

function goStep(n, { keepAlert = false } = {}) {
  s.step = n;
  if (!keepAlert) s.alert = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ① 人数と日付
function stepDate() {
  const max = s.config.policy.maxPartyOnline;
  const [y, m] = s.month.split("-").map(Number);
  const key = `${s.party}|${s.month}`;
  const days = s.calendar.get(key);
  const today = todayJst();
  const lastDay = addDays(today, s.config.policy.bookingWindowDays);
  const canPrev = s.month > today.slice(0, 7);
  const canNext = `${s.month}-01` < lastDay.slice(0, 7) + "-01";

  const blanks = Array.from({ length: wd(`${s.month}-01`) }, () => '<span class="day blank" aria-hidden="true"></span>').join("");
  const cells = Array.from({ length: daysInMonth(y, m) }, (_, i) => {
    const date = `${s.month}-${pad(i + 1)}`;
    const info = days?.find((d) => d.date === date);
    const ok = info?.available === true;
    const mark = ok ? "○" : info && !info.open && lang === "ja" ? t.closed : "";
    const label = `${fmtDate(date)} ${ok ? t.available : info ? (info.open ? t.full : t.closed) : ""}`;
    return `<button type="button" class="day ${ok ? "ok" : ""}" data-date="${date}" ${ok ? "" : "disabled"} aria-pressed="${s.date === date}" aria-label="${esc(label)}">${i + 1}<span class="mark">${mark}</span></button>`;
  }).join("");

  return `
    <section class="section">
      <h2>${t.party}</h2>
      <div class="choices">${Array.from({ length: max }, (_, i) => i + 1).map((n) =>
        `<button type="button" class="choice" data-party="${n}" aria-pressed="${s.party === n}">${n}${t.partyUnit ? `<small>${t.partyUnit}</small>` : ""}</button>`).join("")}</div>
      <p class="note">${t.partyMore(max, esc(s.config.store.phone || ""))}</p>
    </section>
    <section class="section">
      <h2>${t.date}</h2>
      <div class="cal ${days ? "" : "cal-loading"}">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-month="-1" ${canPrev ? "" : "disabled"} aria-label="${t.prevMonth}">${ICON.left}</button>
          <div class="month">${t.monthTitle(y, m)}</div>
          <button type="button" class="cal-nav" data-month="1" ${canNext ? "" : "disabled"} aria-label="${t.nextMonth}">${ICON.right}</button>
        </div>
        <div class="cal-grid">
          ${t.dow.map((d, i) => `<div class="cal-dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${d}</div>`).join("")}
          ${blanks}${cells}
        </div>
        <div class="cal-legend"><span><b>${t.legendOk.slice(0, 1)}</b>${esc(t.legendOk.slice(1))}</span></div>
      </div>
    </section>`;
}

async function loadMonth() {
  const key = `${s.party}|${s.month}`;
  if (s.calendar.has(key)) return;
  const today = todayJst();
  const [y, m] = s.month.split("-").map(Number);
  const from = s.month === today.slice(0, 7) ? today : `${s.month}-01`;
  const days = daysInMonth(y, m) - Number(from.slice(8)) + 1;
  try {
    const res = await api(`/calendar?party=${s.party}&from=${from}&days=${days}`);
    s.calendar.set(key, res.days);
  } catch {
    s.alert = t.netError;
  }
  if (s.step === 1 && `${s.party}|${s.month}` === key) render();
}

// ② 時間とコース
function stepTime() {
  const picked = `<div class="picked"><span class="what">${esc(fmtDate(s.date))}・${esc(t.partyFmt(s.party))}</span><button type="button" class="btn-link" data-go="1">${t.change}</button></div>`;
  if (!s.slots) return picked + `<p class="loading">…</p>`;
  if (s.slots.length === 0) return picked + `<div class="empty">${t.noSlots}</div><div class="actions"><button type="button" class="btn" data-go="1">${t.back}</button></div>`;

  const byPeriod = new Map();
  for (const sl of s.slots) {
    if (!byPeriod.has(sl.periodId)) byPeriod.set(sl.periodId, []);
    byPeriod.get(sl.periodId).push(sl);
  }
  const times = [...byPeriod].map(([pid, list]) => `
    <div class="period"><h3>${esc(periodName(pid))}</h3>
      <div class="choices">${list.map((sl) => `<button type="button" class="choice" data-time="${sl.startMin}" data-period="${pid}" aria-pressed="${s.startMin === sl.startMin}">${fmtTime(sl.startMin)}</button>`).join("")}</div>
    </div>`).join("");

  const slot = s.slots.find((x) => x.startMin === s.startMin);
  const courses = slot ? slot.courseIds : [];
  const courseList = slot ? `
    <section class="section">
      <h2>${t.course}</h2>
      <div class="courses">${courses.map((id) => {
        const c = s.config.courses.find((x) => x.id === id);
        const desc = c && (lang === "en" ? c.descriptionEn : c.descriptionJa);
        return `<button type="button" class="course" data-course="${id ?? ""}" aria-pressed="${s.courseId === id}">
          <span class="dot" aria-hidden="true"></span>
          <span><span class="name">${esc(courseName(id))}</span>
            ${c?.price ? `<div class="price">${esc(t.perPerson(c.price))}</div>` : ""}
            ${desc ? `<div class="desc">${esc(desc)}</div>` : ""}</span>
        </button>`;
      }).join("")}</div>
    </section>` : "";

  return `${picked}
    <section class="section"><h2>${t.time}${t.jst ? `<span class="sub">${t.jst}</span>` : ""}</h2>${times}</section>
    ${courseList}
    <div class="actions">
      <button type="button" class="btn btn-primary" data-act="to-info" ${slot && s.courseId !== undefined ? "" : "disabled"}>${t.next}</button>
      <button type="button" class="btn-link" data-go="1">${t.back}</button>
    </div>`;
}

async function loadSlots() {
  s.slots = null;
  try {
    const res = await api(`/slots?date=${s.date}&party=${s.party}`);
    s.slots = res.slots;
    // 選んでいた時間・コースがもう無ければ選び直してもらう
    const slot = s.slots.find((x) => x.startMin === s.startMin);
    if (!slot) { s.startMin = null; s.courseId = undefined; }
    else if (!slot.courseIds.includes(s.courseId)) s.courseId = slot.courseIds.length === 1 ? slot.courseIds[0] : undefined;
  } catch {
    s.slots = [];
    s.alert = t.netError;
  }
  if (s.step === 2) render();
}

// ③ お客様情報
function field(name, label, { type = "text", req = false, ph = "", hint = "", err = "", auto = "", mode = "" } = {}) {
  return `<label class="field" data-field="${name}"><span class="label">${esc(label)}${req ? `<span class="req">${t.required}</span>` : ""}</span>
    <input class="input" name="${name}" type="${type}" value="${esc(s.form[name])}" placeholder="${esc(ph)}" ${req ? "required" : ""} ${auto ? `autocomplete="${auto}"` : ""} ${mode ? `inputmode="${mode}"` : ""}>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}${err ? `<div class="err">${esc(err)}</div>` : ""}</label>`;
}

function stepInfo() {
  const texts = s.config.texts || {};
  const notices = texts.notices?.[lang] || [];
  const policy = texts.cancelPolicy?.[lang];
  return `
    <div class="picked"><span class="what">${esc(fmtDate(s.date))} ${fmtTime(s.startMin)}・${esc(t.partyFmt(s.party))}</span><button type="button" class="btn-link" data-go="2">${t.change}</button></div>
    <form data-form="info" novalidate>
      <section class="section">
        <h2>${t.info}</h2>
        ${lang === "ja"
          ? `<div class="two">${field("name", t.name, { req: true, ph: t.namePh, err: t.errName, auto: "name" })}${field("kana", t.kana, { ph: t.kanaPh })}</div>`
          : field("name", t.name, { req: true, ph: t.namePh, err: t.errName, auto: "name" })}
        <div class="two">
          ${field("phone", t.phone, { type: "tel", req: true, ph: t.phonePh, hint: t.phoneHint, err: t.errPhone, auto: "tel", mode: "tel" })}
          ${field("email", t.email, { type: "email", req: true, ph: t.emailPh, err: t.errEmail, auto: "email", mode: "email" })}
        </div>
        ${field("allergies", t.allergies, { ph: t.allergiesPh })}
        <label class="field"><span class="label">${t.note}</span>
          <textarea class="textarea" name="note" placeholder="${esc(t.notePh)}">${esc(s.form.note)}</textarea></label>
      </section>
      ${notices.length || policy ? `<section class="section">
        ${notices.length ? `<div class="box"><h3>${t.notices}</h3><ul>${notices.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
        ${policy ? `<div class="box" style="margin-top:10px"><h3>${t.cancelPolicy}</h3><p style="margin:0">${esc(policy)}</p></div>` : ""}
        <label class="agree" data-field="agree"><input type="checkbox" name="agree" ${s.agree ? "checked" : ""}><span>${t.agree}</span></label>
        <div class="field" data-field="agree-msg"><div class="err">${t.errAgree}</div></div>
      </section>` : ""}
      <div class="actions">
        <button type="submit" class="btn btn-primary">${t.toConfirm}</button>
        <button type="button" class="btn-link" data-go="2">${t.back}</button>
      </div>
    </form>`;
}

function validateInfo(form) {
  let first = null;
  const mark = (name, bad) => {
    const el = form.querySelector(`[data-field="${name}"]`);
    el?.classList.toggle("invalid", bad);
    if (bad && !first) first = el;
  };
  const f = s.form;
  mark("name", !f.name.trim());
  mark("phone", f.phone.replace(/\D/g, "").length < 9);
  mark("email", !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()));
  const needAgree = !!form.querySelector("[name=agree]");
  mark("agree-msg", needAgree && !s.agree);
  if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
  return !first;
}

// ④ 確認
function stepConfirm() {
  const f = s.form;
  const ts = s.config.features?.turnstileSiteKey;
  return `
    <section class="section">
      <h2>${t.confirm}</h2>
      <div class="summary"><dl>
        <dt>${t.dateTime}</dt><dd class="big">${esc(fmtDate(s.date))} ${fmtTime(s.startMin)}</dd>
        <dt>${t.partyLabel}</dt><dd>${esc(t.partyFmt(s.party))}</dd>
        <dt>${t.course}</dt><dd>${esc(courseName(s.courseId))}</dd>
        <dt>${t.name}</dt><dd>${esc(f.name)}${f.kana ? `（${esc(f.kana)}）` : ""}</dd>
        <dt>${t.contact}</dt><dd>${esc(f.phone)}<br>${esc(f.email)}</dd>
        ${f.allergies ? `<dt>${t.allergies}</dt><dd>${esc(f.allergies)}</dd>` : ""}
        ${f.note ? `<dt>${t.note}</dt><dd style="white-space:pre-wrap">${esc(f.note)}</dd>` : ""}
      </dl></div>
      ${ts ? '<div id="ts"></div>' : ""}
    </section>
    <div class="actions">
      <button type="button" class="btn btn-primary" data-act="submit">${t.submit}</button>
      <button type="button" class="btn-link" data-go="3">${t.back}</button>
    </div>`;
}

async function submit(btn) {
  const ts = s.config.features?.turnstileSiteKey;
  if (ts && !s.turnstileToken) { s.alert = t.turnstile; return render(); }
  btn.disabled = true;
  btn.textContent = t.sending;
  try {
    const res = await api("/reservations", {
      method: "POST",
      body: {
        date: s.date, startMin: s.startMin, partySize: s.party, courseId: s.courseId,
        ...s.form, lang, agreePolicy: true, turnstileToken: s.turnstileToken,
      },
    });
    s.result = res;
    s.step = 5;
    s.calendar.clear();
    render();
    window.scrollTo({ top: 0 });
  } catch (e) {
    s.turnstileToken = "";
    if (e instanceof ApiError && e.status === 409) {
      // 満席・締切など：時間の選択からやり直してもらう
      s.alert = e.data?.message || t.noSlots;
      s.calendar.clear();
      goStep(2, { keepAlert: true });
      loadSlots();
    } else if (e instanceof ApiError && e.status === 400) {
      goStep(3);
    } else if (e instanceof ApiError && e.status === 403) {
      s.alert = t.turnstile; render();
    } else {
      s.alert = t.netError; render();
    }
  }
}

// 完了
function manageUrl(token) {
  return `${location.origin}/r/${encodeURIComponent(slug)}/manage${lang === "en" ? "?lang=en" : ""}#t=${token}`;
}

function renderDone() {
  const r = s.result;
  const url = manageUrl(r.manageToken);
  $app.innerHTML = `
    <div class="title"><div class="done-mark">${ICON.check}</div><h1>${t.done}</h1></div>
    <p style="text-align:center">${esc(t.doneLead(s.form.name))}</p>
    <div class="summary" style="margin-top:20px"><dl>
      <dt>${t.dateTime}</dt><dd class="big">${esc(fmtDate(r.date))} ${fmtTime(r.startMin)}</dd>
      <dt>${t.partyLabel}</dt><dd>${esc(t.partyFmt(r.partySize))}</dd>
      <dt>${t.course}</dt><dd>${esc(courseName(s.courseId))}</dd>
    </dl></div>
    ${s.config.features?.email ? `<p class="note" style="text-align:center">${t.doneEmail}</p>` : ""}
    <section class="section" style="margin-top:24px">
      <p class="lead" style="margin-bottom:0">${t.manageLink}</p>
      <div class="linkbox"><input class="input" readonly value="${esc(url)}" aria-label="URL"><button type="button" class="btn" data-act="copy">${t.copy}</button></div>
    </section>
    <div class="actions">
      <button type="button" class="btn" data-act="ics">${t.addCal}</button>
      <a class="btn" href="${esc(url)}">${t.openManage}</a>
      ${s.config.store.theme?.homepage ? `<a class="btn-link" style="text-align:center" href="${esc(s.config.store.theme.homepage)}">${t.home}</a>` : ""}
    </div>`;
}

function downloadIcs({ date, startMin, endMin, partySize }) {
  // 日本時間 → UTC で書き出す（どの国のカレンダーでも正しい時刻になる）
  const utc = (min) => {
    const d = new Date(Date.parse(`${date}T00:00:00Z`) + (min - 540) * 60e3);
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };
  const tel = s.config.store.phone;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ATSURAE//Reservation//JA", "BEGIN:VEVENT",
    `UID:${s.result.id}@atsurae`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${utc(startMin)}`, `DTEND:${utc(endMin)}`,
    `SUMMARY:${storeName()} (${t.partyFmt(partySize)})`,
    `DESCRIPTION:${courseName(s.courseId)}${tel ? `\\n${t.tel} ${tel}` : ""}\\n${manageUrl(s.result.manageToken)}`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${slug}-${date}.ics` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 予約の確認・キャンセル
let manage = null;

async function renderManage() {
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  if (!token) { $app.innerHTML = header(t.manageTitle) + `<div class="empty">${t.notFound}</div>`; return; }
  if (!manage) {
    $app.innerHTML = header(t.manageTitle) + '<p class="loading">…</p>';
    try { manage = await api(`/manage/${encodeURIComponent(token)}`); } catch (e) {
      $app.innerHTML = header(t.manageTitle) + `<div class="empty">${e instanceof ApiError && e.status === 404 ? t.notFound : t.netError}</div>`;
      return;
    }
  }
  const r = manage;
  const tel = s.config.store.phone;
  const cancellable = r.status === "confirmed" && `${r.date}T${pad(Math.floor(r.startMin / 60))}:${pad(r.startMin % 60)}` > new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
  $app.innerHTML = header(t.manageTitle) + alertBox() + `
    <div class="summary"><dl>
      <dt>${lang === "ja" ? "状況" : "Status"}</dt><dd>${esc(t.status[r.status] || r.status)}</dd>
      <dt>${t.dateTime}</dt><dd class="big">${esc(fmtDate(r.date))} ${fmtTime(r.startMin)}</dd>
      <dt>${t.partyLabel}</dt><dd>${esc(t.partyFmt(r.partySize))}</dd>
      <dt>${t.course}</dt><dd>${esc(courseName(r.courseId))}</dd>
      <dt>${t.name}</dt><dd>${esc(r.name)}</dd>
      ${r.note ? `<dt>${t.note}</dt><dd style="white-space:pre-wrap">${esc(r.note)}</dd>` : ""}
    </dl></div>
    ${r.status === "cancelled" ? `<p class="note" style="text-align:center;margin-top:18px">${t.cancelled}</p>` : ""}
    ${cancellable ? `
      <p class="note" style="margin-top:18px">${t.changeByPhone(esc(tel || ""))}</p>
      ${s.config.texts?.cancelPolicy?.[lang] ? `<div class="box" style="margin-top:12px"><h3>${t.cancelPolicy}</h3><p style="margin:0">${esc(s.config.texts.cancelPolicy[lang])}</p></div>` : ""}
      <div class="actions" id="cancel-area"><button type="button" class="btn" data-act="cancel-ask">${t.cancel}</button></div>` : ""}`;
}

async function doCancel(btn) {
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  btn.disabled = true;
  try {
    await api(`/manage/${encodeURIComponent(token)}/cancel`, { method: "POST" });
    manage.status = "cancelled";
    s.alert = "";
  } catch (e) {
    s.alert = e instanceof ApiError && e.status === 409 ? (lang === "ja" ? "このご予約はキャンセルできません。お電話でご連絡ください。" : "This booking can no longer be cancelled online. Please call us.") : t.netError;
  }
  renderManage();
}

// ---------- 操作 ----------

$app.addEventListener("click", (e) => {
  const b = e.target.closest("button, a[data-go]");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.party) { s.party = Number(d.party); s.date = null; s.alert = ""; render(); loadMonth(); return; }
  if (d.month) {
    const [y, m] = s.month.split("-").map(Number);
    const n = new Date(Date.UTC(y, m - 1 + Number(d.month), 1));
    s.month = n.toISOString().slice(0, 7);
    render(); loadMonth(); return;
  }
  if (d.date) { s.date = d.date; s.startMin = null; s.courseId = undefined; goStep(2); loadSlots(); return; }
  if (d.time) {
    s.startMin = Number(d.time);
    s.periodId = d.period;
    const slot = s.slots.find((x) => x.startMin === s.startMin);
    s.courseId = slot.courseIds.length === 1 ? slot.courseIds[0] : (slot.courseIds.includes(s.courseId) ? s.courseId : undefined);
    render();
    document.querySelector(".courses")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  if (d.course !== undefined) { s.courseId = d.course || null; render(); return; }
  if (d.go) { goStep(Number(d.go)); if (Number(d.go) === 1) loadMonth(); if (Number(d.go) === 2 && !s.slots) loadSlots(); return; }
  switch (d.act) {
    case "to-info": return goStep(3);
    case "submit": return submit(b);
    case "copy": {
      const input = b.previousElementSibling;
      (navigator.clipboard?.writeText(input.value) ?? Promise.reject()).catch(() => { input.select(); document.execCommand("copy"); });
      b.textContent = t.copied;
      setTimeout(() => { b.textContent = t.copy; }, 1800);
      return;
    }
    case "ics": return downloadIcs(s.result);
    case "cancel-ask":
      document.getElementById("cancel-area").innerHTML = `
        <p style="text-align:center;margin:0 0 4px">${t.cancelAsk}</p>
        <button type="button" class="btn btn-primary" data-act="cancel-do">${t.cancelYes}</button>
        <button type="button" class="btn-link" data-act="cancel-keep">${t.cancelNo}</button>`;
      return;
    case "cancel-do": return doCancel(b);
    case "cancel-keep": return renderManage();
  }
});

$app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.name in s.form) {
    s.form[el.name] = el.value;
    el.closest(".field")?.classList.remove("invalid");
  }
  if (el.name === "agree") {
    s.agree = el.checked;
    document.querySelector('[data-field="agree-msg"]')?.classList.remove("invalid");
  }
});

$app.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.dataset.form === "info" && validateInfo(e.target)) goStep(4);
});

// Turnstile（設定されているときだけ）
let tsLoaded = false;
function afterRender() {
  const key = s.config.features?.turnstileSiteKey;
  const box = document.getElementById("ts");
  if (!key || !box) return;
  const mount = () => window.turnstile.render(box, {
    sitekey: key, language: lang,
    callback: (tok) => { s.turnstileToken = tok; },
    "expired-callback": () => { s.turnstileToken = ""; },
  });
  if (window.turnstile) return mount();
  if (tsLoaded) return;
  tsLoaded = true;
  const sc = Object.assign(document.createElement("script"), { src: "https://challenges.cloudflare.com/turnstile/v0/api.js", async: true });
  sc.onload = () => { if (document.getElementById("ts")) mount(); };
  document.head.appendChild(sc);
}

// ---------- 起動 ----------

(async () => {
  try {
    s.config = await api("/config");
  } catch (e) {
    $app.innerHTML = `<div class="empty">${e instanceof ApiError && e.status === 404 ? t.storeNotFound : t.netError}</div>`;
    return;
  }
  applyTheme(s.config.store.theme);
  s.party = Math.min(2, s.config.policy.maxPartyOnline);
  s.month = todayJst().slice(0, 7);
  renderChrome();
  render();
  if (!isManage) loadMonth();
})();
