// 予約台帳（お店向け）
// 画面：台帳（日）／カレンダー／予約を入れる（＋）／お客様／設定
// URL のハッシュで画面を切り替える：#day/2026-12-03, #cal/2026-12, #customers, #customer/ID, #settings

const $app = document.getElementById("app");
const $sheetRoot = document.getElementById("sheet-root");
const $toast = document.getElementById("toast");

// ---------- 表示用の言葉 ----------

const SOURCE = {
  web: "ネット", phone: "電話", walkin: "来店", tabelog: "食べログ", ikyu: "一休", tablecheck: "TableCheck", other: "その他",
};
const STAFF_SOURCES = ["phone", "walkin", "tabelog", "ikyu", "tablecheck", "other"];
const STATUS = { confirmed: "予約", seated: "来店中", done: "退店済み", cancelled: "キャンセル", no_show: "無断キャンセル" };
const STATUS_BADGE = { confirmed: "", seated: "badge-good", done: "", cancelled: "badge-bad", no_show: "badge-bad" };
const OVERRIDE = { closed: "臨時休業", open: "臨時営業", block: "席を閉じる" };
const REASON = {
  full: "この時間は満席です",
  closed: "この日（枠）は休業の設定です",
  invalid_time: "営業時間の外です",
  course_unavailable: "このコースはこの時間に出していません",
  course_sold_out: "このコースはこの日の上限に達しています",
  party_size: "この人数は受けない設定です",
};
const WD = ["日", "月", "火", "水", "木", "金", "土"];

// ---------- 状態 ----------

const state = {
  store: store_get("store") || "bien-manger",
  token: store_get("token") || "",
  config: null,
  showOff: false,
};

function store_get(k) {
  try { return localStorage.getItem(`ledger:${k}`); } catch { return null; }
}
function store_set(k, v) {
  try { v === null ? localStorage.removeItem(`ledger:${k}`) : localStorage.setItem(`ledger:${k}`, v); } catch { /* 保存できない環境でも動かす */ }
}

// ---------- 小さな道具 ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const parseTime = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const wd = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const fmtDate = (date, withYear = false) => {
  const [y, m, d] = date.split("-").map(Number);
  return `${withYear ? `${y}年` : ""}${m}月${d}日（${WD[wd(date)]}）`;
};
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
/** +819012345678 → 090-1234-5678（日本の番号だけ。海外の番号はそのまま） */
const localPhone = (p) => {
  if (!p || !p.startsWith("+81")) return p || "";
  const d = `0${p.slice(3)}`;
  if (/^0[789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0[36]\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ICON = {
  day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14.8c1.8.7 3 2.4 3.5 5.2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5"/></svg>',
};

function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $toast.hidden = true; }, 2600);
}

// ---------- API ----------

class ApiError extends Error {
  constructor(status, data) { super(data?.error || `HTTP ${status}`); this.status = status; this.data = data; }
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/admin/api/${encodeURIComponent(state.store)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${state.token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    logout("パスワードが違うか、変更されました。もう一度入力してください。");
    throw new ApiError(401, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

function showError(e) {
  if (e instanceof ApiError && e.status === 401) return;
  console.error(e);
  toast(e instanceof ApiError ? `保存できませんでした（${e.data?.error || e.status}）` : "通信できませんでした。電波を確かめてください。");
}

// ---------- 骨組み ----------

function shell({ tab, title, top = "", body }) {
  const name = state.config?.store?.name || "";
  return `
    <div class="shell">
      <header class="topbar">
        <div class="topbar-row">
          <div><div class="store-name">${esc(name)}</div><h1 class="page-title">${esc(title)}</h1></div>
          <div class="spacer"></div>
          <button class="icon-btn" data-act="reload" aria-label="最新にする">${ICON.refresh}</button>
        </div>
        ${top}
      </header>
      <main class="main">${body}</main>
    </div>
    <nav class="tabbar" aria-label="画面の切り替え">
      <div class="tabbar-inner">
        ${tabBtn("day", "台帳", ICON.day, tab)}
        ${tabBtn("cal", "カレンダー", ICON.cal, tab)}
        <button class="tab tab-add" data-act="add" aria-label="予約を入れる"><span class="add-btn">${ICON.plus}</span><span class="label">新規予約</span></button>
        ${tabBtn("customers", "お客様", ICON.people, tab)}
        ${tabBtn("settings", "設定", ICON.gear, tab)}
      </div>
    </nav>`;
}

function tabBtn(id, label, icon, current) {
  return `<button class="tab" data-go="${id}" ${current === id ? 'aria-current="page"' : ""}>${icon}<span>${label}</span></button>`;
}

const loading = () => '<div class="loading">読み込み中…</div>';

// ---------- 画面の切り替え ----------

let currentDate = todayJst();

function route() {
  if (!state.token) return renderLogin();
  if (!state.config) return boot();
  const [view, arg] = location.hash.replace(/^#/, "").split("/");
  closeSheet();
  if (view === "cal") return renderCalendar(arg || currentDate.slice(0, 7));
  if (view === "customers") return renderCustomers();
  if (view === "customer" && arg) return renderCustomer(arg);
  if (view === "settings") return renderSettings();
  if (view === "day" && /^\d{4}-\d{2}-\d{2}$/.test(arg || "")) currentDate = arg;
  return renderDay(currentDate);
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function boot() {
  $app.innerHTML = loading();
  try {
    state.config = await api("/config");
    const accent = state.config.store?.theme?.accent;
    if (accent && /^#[0-9a-f]{3,8}$/i.test(accent)) document.documentElement.style.setProperty("--accent", accent);
    document.title = `予約台帳 | ${state.config.store.name}`;
    route();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) logout("店舗が見つかりません。店舗の ID を確かめてください。");
    else { showError(e); $app.innerHTML = `<div class="login"><p>読み込めませんでした。</p><button class="btn" data-act="reload">もう一度</button></div>`; }
  }
}

// ---------- ログイン（試行用：共通のパスワード） ----------

function renderLogin(message = "") {
  $app.innerHTML = `
    <form class="login" data-form="login">
      <h1>予約台帳</h1>
      <p>お店の ID とパスワードを入力してください。この端末に保存されます。</p>
      ${message ? `<div class="banner banner-bad">${esc(message)}</div>` : ""}
      <label class="field"><span class="label">お店の ID</span>
        <input class="input" name="store" value="${esc(state.store)}" autocapitalize="off" autocomplete="username" required></label>
      <label class="field"><span class="label">パスワード</span>
        <input class="input" name="token" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-block" type="submit">はじめる</button>
    </form>`;
}

function logout(message) {
  state.token = "";
  state.config = null;
  store_set("token", null);
  closeSheet();
  renderLogin(message);
}

// ---------- 台帳（1日） ----------

let dayData = null;

async function renderDay(date) {
  const isToday = date === todayJst();
  const w = wd(date);
  const top = `
    <div class="datebar">
      <button class="icon-btn" data-day="${addDays(date, -1)}" aria-label="前の日">${ICON.left}</button>
      <button class="date-label" data-act="pick-date" aria-label="日付を選ぶ">
        <span class="d">${Number(date.slice(5, 7))}月${Number(date.slice(8))}日</span><span class="w ${w === 0 ? "sun" : w === 6 ? "sat" : ""}">（${WD[w]}）</span>${isToday ? '<span class="today-pill">今日</span>' : ""}
      </button>
      <button class="icon-btn" data-day="${addDays(date, 1)}" aria-label="次の日">${ICON.right}</button>
      <input type="date" class="visually-hidden" id="date-picker" value="${date}" tabindex="-1" aria-hidden="true">
    </div>
    ${isToday ? "" : `<div style="text-align:center;margin-top:2px"><button class="btn btn-ghost btn-sm" data-day="${todayJst()}">今日に戻る</button></div>`}`;
  $app.innerHTML = shell({ tab: "day", title: "台帳", top, body: loading() });
  try {
    dayData = await api(`/reservations?date=${date}`);
    if (currentDate !== date) return; // 読み込み中に別の日へ移った
    document.querySelector(".main").innerHTML = dayBody(dayData);
  } catch (e) {
    showError(e);
    document.querySelector(".main").innerHTML = `<div class="empty">読み込めませんでした。<br><button class="btn btn-sm" data-act="reload">もう一度</button></div>`;
  }
}

function periodName(id) {
  return state.config.periods.find((p) => p.id === id)?.nameJa || "その他";
}
function courseName(id) {
  return state.config.courses.find((c) => c.id === id)?.nameJa || "";
}
function seatName(id) {
  return state.config.seatGroups.find((g) => g.id === id)?.nameJa || "席未定";
}

function dayBody(d) {
  const stats = d.periods.map((p) => {
    const ratio = p.capacity ? Math.min(1, p.guests / p.capacity) : 0;
    return `
      <div class="card period-stat ${p.open ? "" : "closed"}">
        <div class="name">${esc(periodName(p.periodId))}</div>
        ${p.open
          ? `<div class="num">${p.guests}<small>/ ${p.capacity}名</small></div>
             <div class="sub">${p.groups}組</div>
             <div class="meter ${ratio >= 1 ? "full" : ""}"><i style="width:${ratio * 100}%"></i></div>`
          : `<div class="num" style="font-size:18px">休み</div><div class="sub">${p.groups ? `${p.groups}組の予約あり` : "&nbsp;"}</div>`}
      </div>`;
  }).join("");

  const banners = d.overrides.map((o) => {
    const scope = [o.periodId ? periodName(o.periodId) : "終日", o.seatGroupId ? seatName(o.seatGroupId) : ""].filter(Boolean).join("・");
    return `<div class="banner ${o.kind === "closed" ? "banner-bad" : ""}">${esc(OVERRIDE[o.kind])}：${esc(scope)}${o.note ? `（${esc(o.note)}）` : ""}</div>`;
  }).join("");

  const active = d.reservations.filter((r) => !["cancelled", "no_show"].includes(r.status));
  const off = d.reservations.filter((r) => ["cancelled", "no_show"].includes(r.status));

  const groups = new Map();
  for (const r of active) {
    const key = r.periodId || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const order = [...state.config.periods.map((p) => p.id), ""];
  const lists = order.filter((k) => groups.has(k)).map((k) => {
    const rs = groups.get(k);
    const guests = rs.reduce((s, r) => s + r.partySize, 0);
    return `
      <h2 class="section-title">${esc(periodName(k))}<span class="count">${rs.length}組・${guests}名</span></h2>
      <div class="res-list">${rs.map(resCard).join("")}</div>`;
  }).join("");

  return `
    <div class="periods">${stats}</div>
    ${banners ? `<div style="margin-top:12px">${banners}</div>` : ""}
    ${active.length === 0
      ? `<div class="empty">この日の予約はまだありません。<br><br><button class="btn btn-primary" data-act="add">予約を入れる</button></div>`
      : lists}
    ${off.length
      ? state.showOff
        ? `<h2 class="section-title">キャンセル<span class="count">${off.length}件</span></h2><div class="res-list">${off.map(resCard).join("")}</div>
           <button class="toggle-link" data-act="toggle-off">キャンセルを隠す</button>`
        : `<button class="toggle-link" data-act="toggle-off">キャンセル ${off.length}件を表示</button>`
      : ""}`;
}

function flags(r) {
  const c = r.customer;
  const out = [];
  if (c?.allergies) out.push(`<span class="badge badge-warn">アレルギー：${esc(c.allergies.length > 14 ? `${c.allergies.slice(0, 14)}…` : c.allergies)}</span>`);
  for (const a of c?.anniversaries || []) {
    if (a?.label) out.push(`<span class="badge badge-accent">${esc(a.label)}${a.date ? ` ${esc(a.date)}` : ""}</span>`);
  }
  if (r.guestNote) out.push('<span class="badge">ご要望あり</span>');
  if (c && c.visitCount > 0) out.push(`<span class="badge">${c.visitCount}回来店</span>`);
  else if (c) out.push('<span class="badge">はじめて</span>');
  if (c?.noShowCount > 0) out.push(`<span class="badge badge-bad">無断キャンセル${c.noShowCount}回</span>`);
  return out.join("");
}

function resCard(r) {
  const cls = { seated: "is-seated", done: "is-done", cancelled: "is-off", no_show: "is-off" }[r.status] || "";
  const meta = [courseName(r.courseId), seatName(r.seatGroupId), SOURCE[r.source]].filter(Boolean).join("・");
  const quick = r.status === "confirmed"
    ? `<button class="quick go" data-quick="${r.id}" data-to="seated">来店</button>`
    : r.status === "seated"
      ? `<button class="quick" data-quick="${r.id}" data-to="done">退店</button>`
      : r.status !== "done" ? `<span class="badge ${STATUS_BADGE[r.status]}">${STATUS[r.status]}</span>` : "";
  return `
    <div class="res ${cls}" data-res="${r.id}" role="button" tabindex="0">
      <div class="time">${fmtTime(r.startMin)}</div>
      <div>
        <div class="name">${esc(r.guestName)}<span class="sama">様</span></div>
        <div class="meta">${esc(meta)}</div>
        <div class="flags">${flags(r)}</div>
      </div>
      <div class="res-actions">
        <div class="party">${r.partySize}<small>名</small></div>
        ${quick}
      </div>
    </div>`;
}

async function setStatus(id, status, { silent = false } = {}) {
  try {
    await api(`/reservations/${id}`, { method: "PATCH", body: { status } });
    if (!silent) toast(`「${STATUS[status]}」にしました`);
    closeSheet();
    renderDay(currentDate);
  } catch (e) { showError(e); }
}

// ---------- 予約の詳細（シート） ----------

function openReservation(id) {
  const r = dayData?.reservations.find((x) => x.id === id);
  if (!r) return;
  const c = r.customer;
  const seatOptions = [`<option value="">席未定</option>`, ...state.config.seatGroups.map((g) =>
    `<option value="${g.id}" ${g.id === r.seatGroupId ? "selected" : ""}>${esc(g.nameJa)}</option>`)].join("");

  const actions = {
    confirmed: `<button class="btn btn-primary wide" data-status="seated">来店</button>
                <button class="btn btn-danger" data-status="cancelled">キャンセル</button>
                <button class="btn btn-danger" data-status="no_show">無断キャンセル</button>`,
    seated: `<button class="btn btn-primary wide" data-status="done">退店</button>
             <button class="btn wide" data-status="confirmed">来店前に戻す</button>`,
    done: `<button class="btn wide" data-status="seated">来店中に戻す</button>`,
    cancelled: `<button class="btn wide" data-status="confirmed">予約に戻す</button>`,
    no_show: `<button class="btn wide" data-status="confirmed">予約に戻す</button>`,
  }[r.status];

  const ann = (c?.anniversaries || []).filter((a) => a?.label).map((a) => `${esc(a.label)}${a.date ? ` ${esc(a.date)}` : ""}`).join("、");

  openSheet(`
    <div class="sheet-head">
      <h2>${esc(r.guestName)} 様</h2>
      <span class="badge ${STATUS_BADGE[r.status]}">${STATUS[r.status]}</span>
      <button class="icon-btn" data-act="close" aria-label="閉じる">${ICON.close}</button>
    </div>
    <div class="card" style="padding:14px">
      <dl class="kv">
        <dt>日時</dt><dd>${fmtDate(r.date)} ${fmtTime(r.startMin)}〜${fmtTime(r.endMin)}</dd>
        <dt>人数</dt><dd>${r.partySize}名</dd>
        ${r.courseId ? `<dt>コース</dt><dd>${esc(courseName(r.courseId))}</dd>` : ""}
        <dt>経路</dt><dd>${SOURCE[r.source]}</dd>
        ${c?.phone ? `<dt>電話</dt><dd><a href="tel:${esc(c.phone)}">${esc(localPhone(c.phone))}</a></dd>` : ""}
        ${c?.email ? `<dt>メール</dt><dd>${esc(c.email)}</dd>` : ""}
        ${c?.allergies ? `<dt>アレルギー</dt><dd><span class="badge badge-warn" style="white-space:normal;line-height:1.4">${esc(c.allergies)}</span></dd>` : ""}
        ${ann ? `<dt>記念日</dt><dd>${ann}</dd>` : ""}
        ${r.guestNote ? `<dt>ご要望</dt><dd>${esc(r.guestNote)}</dd>` : ""}
        ${c ? `<dt>来店</dt><dd>${c.visitCount ? `${c.visitCount}回` : "はじめて"}${c.noShowCount ? `・無断キャンセル${c.noShowCount}回` : ""}</dd>` : ""}
        ${c?.notes ? `<dt>お客様メモ</dt><dd>${esc(c.notes)}</dd>` : ""}
      </dl>
    </div>
    <div class="sheet-actions">${actions}</div>
    <label class="field" style="margin-top:18px"><span class="label">席</span>
      <select class="select" data-seat="${r.id}">${seatOptions}</select></label>
    <label class="field"><span class="label">店内メモ（お客様には見えません）</span>
      <textarea class="textarea" id="staff-note" placeholder="例：窓側希望、ワインはペアリング">${esc(r.staffNote || "")}</textarea></label>
    <button class="btn btn-block" data-save-note="${r.id}">メモを保存</button>
    ${c ? `<button class="btn btn-ghost btn-block" style="margin-top:6px" data-customer="${c.id}">お客様の情報を見る</button>` : ""}
  `, { onAction: async (el) => {
    if (el.dataset.status) {
      const to = el.dataset.status;
      if (to === "cancelled" || to === "no_show") {
        const ok = await confirmSheet(`${esc(r.guestName)}様の予約を「${STATUS[to]}」にしますか？`, STATUS[to], true);
        if (!ok) return openReservation(id);
      }
      if (to === "confirmed" && ["cancelled", "no_show"].includes(r.status)) {
        const ok = await confirmSheet("予約に戻します。戻した後の席数は確かめないので、満席になっていないか台帳で確認してください。", "予約に戻す");
        if (!ok) return openReservation(id);
      }
      return setStatus(r.id, to);
    }
    if (el.dataset.saveNote) {
      try {
        await api(`/reservations/${r.id}`, { method: "PATCH", body: { staffNote: document.getElementById("staff-note").value } });
        toast("メモを保存しました");
        closeSheet();
        renderDay(currentDate);
      } catch (e) { showError(e); }
    }
    if (el.dataset.customer) { closeSheet(); go(`#customer/${el.dataset.customer}`); }
  }, onChange: async (el) => {
    if (el.dataset.seat) {
      try {
        await api(`/reservations/${r.id}`, { method: "PATCH", body: { seatGroupId: el.value || null } });
        toast(`席を「${el.value ? seatName(el.value) : "席未定"}」にしました`);
        const d = await api(`/reservations?date=${currentDate}`);
        dayData = d;
        document.querySelector(".main").innerHTML = dayBody(d);
      } catch (e) { showError(e); }
    }
  } });
}

// ---------- 予約を入れる（シート） ----------

function openAdd(prefill = {}) {
  const f = {
    date: prefill.date || currentDate,
    party: prefill.party || 2,
    time: prefill.time ?? null,
    source: "phone",
    customerId: null,
    ...prefill,
  };
  const periods = state.config.periods;
  const times = periods.map((p) => {
    const starts = [...p.startTimes];
    // 店側は最終入店まで30分きざみでも選べる
    for (let t = Math.min(...p.startTimes); t <= p.lastEntry; t += 30) if (!starts.includes(t)) starts.push(t);
    starts.sort((a, b) => a - b);
    return `<div style="margin-bottom:8px"><div class="hint" style="margin:0 0 4px">${esc(p.nameJa)}</div>
      <div class="chip-row">${starts.map((t) => `<button type="button" class="chip chip-sm" data-time="${t}">${fmtTime(t)}</button>`).join("")}</div></div>`;
  }).join("");

  openSheet(`
    <form data-form="add" autocomplete="off">
      <div class="sheet-head">
        <h2>予約を入れる</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="閉じる">${ICON.close}</button>
      </div>

      <label class="field"><span class="label">日付</span>
        <input class="input" type="date" name="date" value="${f.date}" required></label>

      <div class="field"><span class="label">人数</span>
        <div class="chip-row">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button type="button" class="chip" data-party="${n}">${n}</button>`).join("")}</div>
        <div class="chip-row" style="align-items:center;margin-top:8px"><span class="hint" style="margin:0">ほかの人数</span>
          <input class="input" type="number" name="party" min="1" max="99" inputmode="numeric" value="${f.party}" style="width:90px" aria-label="人数"><span class="hint" style="margin:0">名</span></div></div>

      <div class="field"><span class="label">時間</span>
        ${times}
        <div class="chip-row" style="align-items:center"><span class="hint" style="margin:0">ほかの時間</span>
          <input class="input" type="time" name="time" step="300" value="${f.time !== null ? `${pad(Math.floor(f.time / 60))}:${pad(f.time % 60)}` : ""}" style="width:130px" required></div>
      </div>

      <div class="field"><span class="label">経路</span>
        <div class="chip-row">${STAFF_SOURCES.map((s) => `<button type="button" class="chip chip-sm" data-source="${s}">${SOURCE[s]}</button>`).join("")}</div></div>

      <label class="field"><span class="label">電話番号</span>
        <input class="input" type="tel" name="phone" inputmode="tel" placeholder="090-1234-5678"></label>
      <div class="suggest" id="suggest"></div>
      <div id="picked"></div>

      <label class="field"><span class="label">お名前（必須）</span>
        <input class="input" name="name" required placeholder="山田 花子"></label>
      <label class="field"><span class="label">ふりがな</span>
        <input class="input" name="kana" placeholder="やまだ はなこ"></label>

      <label class="field"><span class="label">コース</span>
        <select class="select" name="courseId"><option value="">未定</option>
          ${state.config.courses.map((c) => `<option value="${c.id}">${esc(c.nameJa)}${c.price ? `（${c.price.toLocaleString()}円）` : ""}</option>`).join("")}
        </select></label>

      <details style="margin-bottom:14px">
        <summary style="cursor:pointer;color:var(--ink-2);font-size:14px;padding:6px 0">アレルギー・メール・メモ</summary>
        <div style="margin-top:10px">
          <label class="field"><span class="label">アレルギー・苦手なもの</span>
            <input class="input" name="allergies" placeholder="例：甲殻類"></label>
          <label class="field"><span class="label">メール（あれば確認メールを送ります）</span>
            <input class="input" type="email" name="email" inputmode="email" autocapitalize="off"></label>
          <label class="field"><span class="label">ご要望</span>
            <textarea class="textarea" name="note" placeholder="例：記念日、窓側希望"></textarea></label>
          <label class="field"><span class="label">店内メモ</span>
            <textarea class="textarea" name="staffNote"></textarea></label>
          <label class="field"><span class="label">席</span>
            <select class="select" name="seatGroupId"><option value="">自動で決める</option>
              ${state.config.seatGroups.map((g) => `<option value="${g.id}">${esc(g.nameJa)}</option>`).join("")}</select></label>
        </div>
      </details>

      <div class="sticky-save"><button class="btn btn-primary btn-block" type="submit">保存する</button></div>
    </form>`, {
    onOpen: (root) => {
      const form = root.querySelector("form");
      const pick = (sel, val) => root.querySelectorAll(sel).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[sel.slice(6, -1)] === String(val))));
      const sync = () => {
        pick("[data-party]", form.party.value);
        pick("[data-time]", parseTime(form.time.value) ?? "");
        pick("[data-source]", f.source);
      };
      sync();
      root.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.party) { form.party.value = b.dataset.party; sync(); }
        if (b.dataset.time) { const t = Number(b.dataset.time); form.time.value = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; sync(); }
        if (b.dataset.source) { f.source = b.dataset.source; sync(); }
        if (b.dataset.pick) {
          const c = JSON.parse(b.dataset.pick);
          f.customerId = c.id;
          form.name.value = c.name || "";
          form.kana.value = c.kana || "";
          if (c.phone) form.phone.value = localPhone(c.phone);
          form.allergies.value = c.allergies || "";
          form.email.value = c.email || "";
          root.querySelector("#suggest").innerHTML = "";
          root.querySelector("#picked").innerHTML = `<div class="banner" style="display:flex;align-items:center;gap:8px">
            <span style="flex:1">${esc(c.name)}様の情報を使います（${c.visit_count ? `${c.visit_count}回来店` : "はじめて"}）</span>
            <button type="button" class="btn btn-sm" data-unpick="1">解除</button></div>`;
          if (c.allergies) root.querySelector("details").open = true;
        }
        if (b.dataset.unpick) { f.customerId = null; root.querySelector("#picked").innerHTML = ""; }
      });
      form.party.addEventListener("input", sync);
      form.time.addEventListener("input", sync);

      const lookup = debounce(async (q) => {
        const box = root.querySelector("#suggest");
        if (q.replace(/\D/g, "").length < 4 && q.length < 2) { box.innerHTML = ""; return; }
        try {
          const { customers } = await api(`/customers?q=${encodeURIComponent(q)}`);
          box.innerHTML = customers.slice(0, 3).map((c) => `
            <button type="button" data-pick="${esc(JSON.stringify(c))}">
              <div class="t">${esc(c.name)} 様 ${c.kana ? `<span style="font-weight:400;color:var(--ink-2)">${esc(c.kana)}</span>` : ""}</div>
              <div class="s">${esc(localPhone(c.phone))}・${c.visit_count ? `${c.visit_count}回来店` : "来店前"}${c.allergies ? `・アレルギー：${esc(c.allergies)}` : ""}</div>
            </button>`).join("");
          // 保存ボタンやキーボードに隠れないように候補を見える位置へ
          if (customers.length) box.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { /* 候補が出ないだけなので黙る */ }
      }, 250);
      form.phone.addEventListener("input", () => { if (!f.customerId) lookup(form.phone.value); });
      form.name.addEventListener("input", () => { if (!f.customerId && !form.phone.value) lookup(form.name.value); });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const startMin = parseTime(form.time.value);
        if (startMin === null) { toast("時間を選んでください"); return; }
        const body = {
          date: form.date.value,
          startMin,
          partySize: Number(form.party.value),
          source: f.source,
          customerId: f.customerId,
          name: form.name.value,
          kana: form.kana.value,
          phone: form.phone.value,
          email: form.email.value,
          allergies: form.allergies.value,
          note: form.note.value,
          staffNote: form.staffNote.value,
          courseId: form.courseId.value || null,
          seatGroupId: form.seatGroupId.value || null,
        };
        const submit = form.querySelector("[type=submit]");
        submit.disabled = true;
        try {
          await save(body);
        } finally {
          submit.disabled = false;
        }
      });

      async function save(body) {
        try {
          await api("/reservations", { method: "POST", body });
          done(body);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && e.data?.canForce) {
            const msg = REASON[e.data.error] || "この条件では入れられません";
            const ok = await confirmSheet(`${msg}。<br>このまま入れますか？（席数を超えることがあります）`, "このまま入れる");
            if (ok) {
              try { await api("/reservations", { method: "POST", body: { ...body, force: true } }); done(body); } catch (e2) { showError(e2); }
            } else {
              reopen(body);
            }
          } else if (e instanceof ApiError && e.status === 400) {
            toast(`入力を確かめてください（${(e.data?.fields || []).map((x) => ({ name: "お名前", email: "メール", partySize: "人数", date: "日付", time: "時間" })[x] || x).join("・")}）`);
          } else showError(e);
        }
      }

      function done(body) {
        closeSheet();
        toast(`${body.name}様 ${fmtDate(body.date)} ${fmtTime(body.startMin)} ${body.partySize}名を入れました`);
        currentDate = body.date;
        go(`#day/${body.date}`);
      }

      function reopen(body) {
        // 確認で「やめる」を選んだら入力を残したまま戻る
        openAdd({ date: body.date, party: body.partySize, time: body.startMin });
        const form2 = $sheetRoot.querySelector("form");
        for (const k of ["name", "kana", "phone", "email", "allergies", "note", "staffNote"]) form2[k].value = body[k] || "";
        form2.courseId.value = body.courseId || "";
        form2.seatGroupId.value = body.seatGroupId || "";
      }
    },
  });
}

// ---------- カレンダー ----------

async function renderCalendar(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${y}-${pad(m)}-01`;
  const start = addDays(first, -wd(first));
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  const top = `
    <div class="cal-head" style="margin-top:6px">
      <button class="icon-btn" data-go="cal/${prev}" aria-label="前の月">${ICON.left}</button>
      <div class="month">${y}年${m}月</div>
      <button class="icon-btn" data-go="cal/${next}" aria-label="次の月">${ICON.right}</button>
    </div>`;
  $app.innerHTML = shell({ tab: "cal", title: "カレンダー", top, body: loading() });
  try {
    const { days } = await api(`/summary?from=${start}&days=42`);
    const today = todayJst();
    const cells = days.map(({ date, periods }) => {
      const open = periods.filter((p) => p.open);
      const guests = periods.reduce((s, p) => s + p.guests, 0);
      const cap = open.reduce((s, p) => s + p.capacity, 0);
      const ratio = cap ? Math.min(1, guests / cap) : 0;
      const cls = [
        date.slice(0, 7) !== ym ? "out" : "",
        open.length === 0 ? "closed" : "",
        date === today ? "today" : "",
        date < today ? "past" : "",
        ratio >= 1 ? "full" : "",
      ].join(" ");
      const label = open.length === 0 ? (guests ? `${guests}名` : "休") : `${guests}名`;
      return `<button class="cal-day ${cls}" data-day="${date}" aria-label="${fmtDate(date)} ${open.length ? `${guests}名` : "休み"}">
        <span class="n">${Number(date.slice(8))}</span>
        <span class="g ${guests === 0 && open.length ? "zero" : ""}">${label}</span>
        <span class="bar">${open.length ? `<i style="width:${ratio * 100}%"></i>` : ""}</span>
      </button>`;
    }).join("");
    document.querySelector(".main").innerHTML = `
      <div class="cal">${WD.map((w, i) => `<div class="dow ${i === 0 ? "sun" : ""}">${w}</div>`).join("")}${cells}</div>
      <div class="cal-legend"><span>数字は予約の人数</span><span>線は埋まり具合</span></div>`;
  } catch (e) { showError(e); }
}

// ---------- お客様 ----------

let lastQuery = "";

function renderCustomers() {
  $app.innerHTML = shell({
    tab: "customers",
    title: "お客様",
    top: `<div class="search" style="margin-top:8px">${ICON.search}
      <input class="input" type="search" id="q" placeholder="名前・ふりがな・電話番号" value="${esc(lastQuery)}" autocomplete="off"></div>`,
    body: `<div id="results"><div class="empty">名前・ふりがな・電話番号の一部で探せます。</div></div>`,
  });
  const input = document.getElementById("q");
  const run = debounce(async () => {
    lastQuery = input.value.trim();
    const box = document.getElementById("results");
    if (!lastQuery) { box.innerHTML = `<div class="empty">名前・ふりがな・電話番号の一部で探せます。</div>`; return; }
    try {
      const { customers } = await api(`/customers?q=${encodeURIComponent(lastQuery)}`);
      box.innerHTML = customers.length
        ? `<div class="list">${customers.map((c) => `
            <button class="card row" data-customer="${c.id}">
              <div class="main-col">
                <div class="title">${esc(c.name)} 様 <span style="font-weight:400;color:var(--ink-2);font-size:13px">${esc(c.kana || "")}</span></div>
                <div class="sub">${esc(localPhone(c.phone) || "電話番号なし")}${c.last_visit_date ? `・前回 ${esc(c.last_visit_date)}` : ""}</div>
              </div>
              ${c.allergies ? '<span class="badge badge-warn">アレルギー</span>' : ""}
              <span class="badge">${c.visit_count}回</span>
            </button>`).join("")}</div>`
        : `<div class="empty">見つかりませんでした。</div>`;
    } catch (e) { showError(e); }
  }, 250);
  input.addEventListener("input", run);
  if (lastQuery) run();
}

async function renderCustomer(id) {
  $app.innerHTML = shell({
    tab: "customers",
    title: "お客様",
    top: `<button class="btn btn-ghost btn-sm" data-go="customers" style="margin-top:4px;padding-left:0">${ICON.left.replace("<svg", '<svg width="18" height="18"')} 一覧に戻る</button>`,
    body: loading(),
  });
  try {
    const c = await api(`/customers/${id}`);
    const ann = c.anniversaries.length ? c.anniversaries : [{ label: "", date: "" }];
    document.querySelector(".main").innerHTML = `
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <div style="font-size:20px;font-weight:650">${esc(c.name)} 様</div>
          <div style="color:var(--ink-2)">${esc(c.kana || "")}</div>
        </div>
        <div class="chip-row" style="margin-top:8px">
          <span class="badge">${c.visit_count ? `${c.visit_count}回来店` : "来店前"}</span>
          ${c.last_visit_date ? `<span class="badge">前回 ${esc(c.last_visit_date)}</span>` : ""}
          ${c.no_show_count ? `<span class="badge badge-bad">無断キャンセル${c.no_show_count}回</span>` : ""}
          ${c.phone ? `<a class="badge" href="tel:${esc(c.phone)}">電話をかける</a>` : ""}
        </div>
      </div>

      <form data-form="customer" data-id="${c.id}" style="margin-top:16px">
        <label class="field"><span class="label">お名前</span><input class="input" name="name" value="${esc(c.name)}" required></label>
        <label class="field"><span class="label">ふりがな</span><input class="input" name="kana" value="${esc(c.kana || "")}"></label>
        <label class="field"><span class="label">電話番号</span><input class="input" type="tel" name="phone" value="${esc(localPhone(c.phone))}"></label>
        <label class="field"><span class="label">メール</span><input class="input" type="email" name="email" value="${esc(c.email || "")}" autocapitalize="off"></label>
        <label class="field"><span class="label">アレルギー・苦手なもの</span><input class="input" name="allergies" value="${esc(c.allergies || "")}"></label>
        <label class="field"><span class="label">お好み</span><textarea class="textarea" name="preferences" placeholder="例：赤ワイン好き、焼き加減はミディアムレア">${esc(c.preferences || "")}</textarea></label>
        <div class="field"><span class="label">記念日</span>
          <div id="anns" style="display:grid;gap:8px">${ann.map(annRow).join("")}</div>
          <button type="button" class="btn btn-sm" data-add-ann="1" style="margin-top:8px">記念日を足す</button></div>
        <label class="field"><span class="label">お客様メモ（店内のみ）</span><textarea class="textarea" name="notes">${esc(c.notes || "")}</textarea></label>
        <button class="btn btn-primary btn-block" type="submit">保存する</button>
      </form>

      <h2 class="section-title">来店の履歴<span class="count">${c.history.length}件</span></h2>
      <div class="card" style="padding:4px 14px">
        ${c.history.length ? `<div class="history">${c.history.map((h) => `
          <button class="h" data-day="${h.date}" style="background:none;border:0;border-bottom:1px solid var(--line);text-align:left;width:100%;padding:10px 0">
            <span style="width:150px">${fmtDate(h.date, true).replace(/（.）/, "")}</span>
            <span>${fmtTime(h.startMin)}</span><span>${h.partySize}名</span>
            <span class="spacer"></span><span class="badge ${STATUS_BADGE[h.status]}">${STATUS[h.status]}</span>
          </button>`).join("")}</div>` : '<div class="empty">まだありません。</div>'}
      </div>`;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) document.querySelector(".main").innerHTML = '<div class="empty">見つかりませんでした。</div>';
    else showError(e);
  }
}

function annRow(a) {
  return `<div class="ann" style="display:grid;grid-template-columns:1fr 120px 40px;gap:6px">
    <input class="input" name="ann-label" placeholder="例：結婚記念日" value="${esc(a.label || "")}">
    <input class="input" name="ann-date" placeholder="例：06-12" value="${esc(a.date || "")}">
    <button type="button" class="icon-btn" data-del-ann="1" aria-label="この記念日を消す">${ICON.close}</button></div>`;
}

// ---------- 設定 ----------

async function renderSettings() {
  $app.innerHTML = shell({ tab: "settings", title: "設定", body: loading() });
  try {
    const { overrides } = await api(`/overrides?from=${todayJst()}`);
    const cfg = state.config;
    const days = (bits) => WD.filter((_, i) => bits & (1 << i)).join("・");
    const closedDays = (bits) => WD.filter((_, i) => !(bits & (1 << i)));
    document.querySelector(".main").innerHTML = `
      <h2 class="section-title" style="margin-top:6px">臨時休業・貸切</h2>
      <div class="list" style="margin-top:0">
        ${overrides.length ? overrides.map((o) => `
          <div class="card row">
            <div class="main-col">
              <div class="title">${fmtDate(o.date)}　${OVERRIDE[o.kind]}</div>
              <div class="sub">${[o.periodId ? periodName(o.periodId) : "終日", o.seatGroupId ? seatName(o.seatGroupId) : ""].filter(Boolean).join("・")}${o.note ? `・${esc(o.note)}` : ""}</div>
            </div>
            <button class="btn btn-sm btn-danger" data-del-override="${o.id}">取り消す</button>
          </div>`).join("") : '<div class="empty" style="padding:16px">予定はありません。</div>'}
      </div>
      <button class="btn btn-block" data-act="add-override" style="margin-top:10px">臨時休業・貸切を入れる</button>

      <h2 class="section-title">営業の設定</h2>
      <div class="card" style="padding:14px">
        <dl class="kv">
          ${cfg.periods.map((p) => `<dt>${esc(p.nameJa)}</dt><dd>${p.startTimes.map(fmtTime).join("・")} 入店（最終 ${fmtTime(p.lastEntry)}）<br><span class="hint">${days(p.weekdays)}${closedDays(p.weekdays).length ? `／定休 ${closedDays(p.weekdays).join("・")}` : ""}</span></dd>`).join("")}
          ${cfg.seatGroups.map((g) => `<dt>${esc(g.nameJa)}</dt><dd>${g.capacity}席（ネット予約に ${g.onlineCapacity}席）</dd>`).join("")}
          <dt>ネット予約</dt><dd>${cfg.policy.bookingWindowDays}日先まで・${cfg.policy.cutoffMinutes >= 1440 ? `${Math.round(cfg.policy.cutoffMinutes / 1440)}日前` : `${cfg.policy.cutoffMinutes}分前`}に締切・${cfg.policy.maxPartyOnline}名まで</dd>
        </dl>
        <div class="hint" style="margin-top:10px">コース：${cfg.courses.map((c) => esc(c.nameJa)).join("、")}</div>
      </div>
      <p class="hint">営業時間・席数・コースの変更は ATSURAE にご連絡ください。</p>

      <h2 class="section-title">この端末</h2>
      <button class="btn btn-block btn-danger" data-act="logout">ログアウト</button>`;
  } catch (e) { showError(e); }
}

function openOverride() {
  const f = { kind: "closed", periodId: "", seatGroupId: "" };
  openSheet(`
    <form data-form="override">
      <div class="sheet-head"><h2>臨時休業・貸切を入れる</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="閉じる">${ICON.close}</button></div>
      <label class="field"><span class="label">日付</span><input class="input" type="date" name="date" value="${currentDate}" required></label>
      <div class="field"><span class="label">種類</span><div class="chip-row">
        ${Object.entries(OVERRIDE).map(([k, v]) => `<button type="button" class="chip chip-sm" data-kind="${k}">${v}</button>`).join("")}</div>
        <div class="hint" id="kind-hint"></div></div>
      <div class="field"><span class="label">時間帯</span><div class="chip-row">
        <button type="button" class="chip chip-sm" data-period="">終日</button>
        ${state.config.periods.map((p) => `<button type="button" class="chip chip-sm" data-period="${p.id}">${esc(p.nameJa)}</button>`).join("")}</div></div>
      <div class="field" id="seat-field"><span class="label">閉じる席</span><div class="chip-row">
        <button type="button" class="chip chip-sm" data-seatg="">全席</button>
        ${state.config.seatGroups.map((g) => `<button type="button" class="chip chip-sm" data-seatg="${g.id}">${esc(g.nameJa)}</button>`).join("")}</div></div>
      <label class="field"><span class="label">メモ</span><input class="input" name="note" placeholder="例：貸切（〇〇様）"></label>
      <button class="btn btn-primary btn-block" type="submit">保存する</button>
    </form>`, {
    onOpen: (root) => {
      const hints = {
        closed: "この日（時間帯）はネット予約を受けません。",
        open: "定休日でもこの日（時間帯）はネット予約を受けます。",
        block: "選んだ席をネット予約に出しません（貸切・グルメサイト用の確保など）。",
      };
      const sync = () => {
        root.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === f.kind)));
        root.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.period === f.periodId)));
        root.querySelectorAll("[data-seatg]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.seatg === f.seatGroupId)));
        root.querySelector("#seat-field").hidden = f.kind !== "block";
        root.querySelector("#kind-hint").textContent = hints[f.kind];
      };
      sync();
      root.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.kind !== undefined) f.kind = b.dataset.kind;
        if (b.dataset.period !== undefined) f.periodId = b.dataset.period;
        if (b.dataset.seatg !== undefined) f.seatGroupId = b.dataset.seatg;
        sync();
      });
      root.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        try {
          await api("/overrides", {
            method: "POST",
            body: {
              date: form.date.value,
              kind: f.kind,
              periodId: f.periodId || null,
              seatGroupId: f.kind === "block" ? f.seatGroupId || null : null,
              note: form.note.value,
            },
          });
          closeSheet();
          toast(`${fmtDate(form.date.value)}に「${OVERRIDE[f.kind]}」を入れました`);
          renderSettings();
        } catch (err) { showError(err); }
      });
    },
  });
}

// ---------- シート ----------

let sheetHandlers = null;

function openSheet(html, handlers = {}) {
  $sheetRoot.innerHTML = `<div class="backdrop" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  sheetHandlers = handlers;
  document.body.style.overflow = "hidden";
  handlers.onOpen?.($sheetRoot.querySelector(".sheet"));
  const first = $sheetRoot.querySelector(".sheet input:not([type=hidden]), .sheet button.btn-primary");
  if (first && matchMedia("(hover: hover)").matches) first.focus();
}

function closeSheet() {
  if (!$sheetRoot.innerHTML) return;
  $sheetRoot.innerHTML = "";
  sheetHandlers = null;
  document.body.style.overflow = "";
}

function confirmSheet(message, okLabel, danger = false) {
  return new Promise((resolve) => {
    openSheet(`
      <p style="font-size:16px;margin:6px 0 18px">${message}</p>
      <div class="sheet-actions">
        <button class="btn" data-confirm="0">やめる</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm="1">${esc(okLabel)}</button>
      </div>`, {
      onAction: (el) => { if (el.dataset.confirm !== undefined) { closeSheet(); resolve(el.dataset.confirm === "1"); } },
      onClose: () => resolve(false),
    });
  });
}

$sheetRoot.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act], button");
  if (!el) return;
  if (el.dataset.act === "close") {
    const h = sheetHandlers;
    closeSheet();
    h?.onClose?.();
    return;
  }
  sheetHandlers?.onAction?.(el);
});
$sheetRoot.addEventListener("change", (e) => sheetHandlers?.onChange?.(e.target));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheetHandlers) { const h = sheetHandlers; closeSheet(); h?.onClose?.(); }
});

// ---------- 画面の操作 ----------

$app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act], [data-go], [data-day], [data-res], [data-quick], [data-customer], [data-del-override], [data-add-ann], [data-del-ann]");
  if (!el) return;

  if (el.dataset.quick) {
    e.stopPropagation();
    el.disabled = true;
    const r = dayData?.reservations.find((x) => x.id === el.dataset.quick);
    await setStatus(el.dataset.quick, el.dataset.to, { silent: true });
    toast(`${r ? `${r.guestName}様を` : ""}「${STATUS[el.dataset.to]}」にしました`);
    return;
  }
  if (el.dataset.go !== undefined) return go(`#${el.dataset.go}`);
  if (el.dataset.day) { currentDate = el.dataset.day; return go(`#day/${el.dataset.day}`); }
  if (el.dataset.res) return openReservation(el.dataset.res);
  if (el.dataset.customer) return go(`#customer/${el.dataset.customer}`);
  if (el.dataset.addAnn) { document.getElementById("anns").insertAdjacentHTML("beforeend", annRow({})); return; }
  if (el.dataset.delAnn) { el.closest(".ann").remove(); return; }
  if (el.dataset.delOverride) {
    if (!(await confirmSheet("この設定を取り消しますか？", "取り消す", true))) return;
    try { await api(`/overrides/${el.dataset.delOverride}`, { method: "DELETE" }); toast("取り消しました"); renderSettings(); } catch (err) { showError(err); }
    return;
  }

  switch (el.dataset.act) {
    case "add": return openAdd();
    case "reload": return state.config ? route() : boot();
    case "toggle-off": state.showOff = !state.showOff; document.querySelector(".main").innerHTML = dayBody(dayData); return;
    case "add-override": return openOverride();
    case "logout":
      if (await confirmSheet("この端末からログアウトしますか？", "ログアウト", true)) logout("");
      return;
    case "pick-date": {
      const p = document.getElementById("date-picker");
      p.addEventListener("change", () => { if (p.value) { currentDate = p.value; go(`#day/${p.value}`); } }, { once: true });
      try { p.showPicker(); } catch { p.click(); }
      return;
    }
  }
});

$app.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.dataset?.res) openReservation(e.target.dataset.res);
});

$app.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.dataset.form === "login") {
    e.preventDefault();
    state.store = form.store.value.trim();
    state.token = form.token.value;
    try {
      await api("/config");
      store_set("store", state.store);
      store_set("token", state.token);
      history.replaceState(null, "", "#day");
      boot();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) renderLogin("店舗が見つかりません。お店の ID を確かめてください。");
      else if (!(err instanceof ApiError && err.status === 401)) renderLogin("つながりませんでした。電波を確かめてください。");
    }
  }
  if (form.dataset.form === "customer") {
    e.preventDefault();
    const anniversaries = [...form.querySelectorAll(".ann")].map((row) => ({
      label: row.querySelector("[name=ann-label]").value,
      date: row.querySelector("[name=ann-date]").value,
    }));
    const body = Object.fromEntries(["name", "kana", "phone", "email", "allergies", "preferences", "notes"].map((k) => [k, form[k].value]));
    try {
      await api(`/customers/${form.dataset.id}`, { method: "PATCH", body: { ...body, anniversaries } });
      toast("保存しました");
      renderCustomer(form.dataset.id);
    } catch (err) {
      if (err instanceof ApiError && err.data?.error === "phone_in_use") toast("この電話番号は別のお客様で登録されています");
      else showError(err);
    }
  }
});

// 画面に戻ってきたら最新にする（他の端末やネット予約の分を反映）
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.config && !sheetHandlers) route();
});
window.addEventListener("hashchange", route);

route();
