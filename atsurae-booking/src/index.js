// ATSURAE 予約システム（美容室・ネイル向けの最初の版）
//
// 1つの Worker で複数のお店を受け持つ。お店は URL の slug で見分ける。
//   /book/:slug        お客様の予約画面
//   /cancel/:token     お客様のキャンセル画面（予約完了メールのリンク）
//   /admin/:slug       店主用の予約一覧
// 日時はすべて日本時間の 'YYYY-MM-DDTHH:MM' で扱う。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 画面（HTML）は静的ファイルを返し、中身は画面側の JavaScript が API から取る
      if (/^\/book\/[a-z0-9-]+\/?$/.test(path)) return page(env, request, '/book/');
      if (/^\/cancel\/[A-Za-z0-9-]+\/?$/.test(path)) return page(env, request, '/cancel/');
      if (/^\/admin\/[a-z0-9-]+\/?$/.test(path)) return page(env, request, '/admin/');

      const parts = path.split('/').filter(Boolean);
      if (parts[0] !== 'api') return env.ASSETS.fetch(request);

      // /api/shops/:slug ...
      if (parts[1] === 'shops' && parts[2]) {
        const shop = await getShop(env, parts[2]);
        if (!shop) return error(404, 'お店が見つかりません。');
        if (request.method === 'GET' && parts.length === 3) return shopInfo(env, shop);
        if (request.method === 'GET' && parts[3] === 'calendar') return calendar(env, shop, url);
        if (request.method === 'GET' && parts[3] === 'availability') return availability(env, shop, url);
        if (request.method === 'POST' && parts[3] === 'bookings') return createBooking(env, ctx, shop, request);
      }

      // /api/bookings/:token ...
      if (parts[1] === 'bookings' && parts[2]) {
        if (request.method === 'GET' && parts.length === 3) return showBooking(env, parts[2]);
        if (request.method === 'POST' && parts[3] === 'cancel') return cancelByCustomer(env, ctx, parts[2]);
      }

      // /api/admin/:slug ...
      if (parts[1] === 'admin' && parts[2]) {
        const shop = await getShop(env, parts[2]);
        if (!shop || !(await isOwner(request, shop))) return error(401, '合言葉が違います。');
        if (request.method === 'GET' && parts[3] === 'bookings') return adminList(env, shop, url);
        if (request.method === 'POST' && parts[3] === 'bookings' && parts.length === 4) return adminCreate(env, shop, request);
        if (request.method === 'POST' && parts[3] === 'bookings' && parts[5] === 'cancel') return adminCancel(env, ctx, shop, parts[4]);
      }

      return error(404, 'ページが見つかりません。');
    } catch (err) {
      console.error(err);
      return error(500, 'エラーが起きました。時間をおいてもう一度お試しください。');
    }
  },
};

/* ---------- 画面 ---------- */

function page(env, request, assetPath) {
  return env.ASSETS.fetch(new Request(new URL(assetPath, request.url), request));
}

/* ---------- お客様向け ---------- */

async function shopInfo(env, shop) {
  const { results: menus } = await env.DB.prepare(
    'SELECT id, name, description, duration_min, price FROM menus WHERE shop_id = ? AND active = 1 ORDER BY sort, id'
  ).bind(shop.id).all();
  return json({
    name: shop.name,
    phone: shop.phone,
    address: shop.address,
    accent: shop.accent,
    policy: shop.policy,
    menus,
  });
}

// 指定日から数日分、予約できる枠がいくつあるかを返す（日付を選ぶ欄に使う）
async function calendar(env, shop, url) {
  const menu = await getMenu(env, shop, url.searchParams.get('menu'));
  if (!menu) return error(400, 'メニューを選んでください。');
  const today = nowJst().slice(0, 10);
  const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : today;
  const days = Math.min(Number(url.searchParams.get('days')) || 14, 31);

  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const slots = await openSlots(env, shop, menu, date);
    out.push({ date, weekday: weekdayOf(date), available: slots === null ? null : slots.length });
  }
  return json({ days: out });
}

async function availability(env, shop, url) {
  const menu = await getMenu(env, shop, url.searchParams.get('menu'));
  if (!menu) return error(400, 'メニューを選んでください。');
  const date = url.searchParams.get('date');
  if (!isDate(date)) return error(400, '日付が正しくありません。');
  const slots = await openSlots(env, shop, menu, date);
  return json({ date, times: slots ?? [] });
}

async function createBooking(env, ctx, shop, request) {
  const body = await readJson(request);
  if (!body) return error(400, '送信内容を読み取れませんでした。');
  // ロボットよけ：画面に表示しない欄に何か入っていたら受け付けない
  if (body.website) return error(400, '送信内容を確認してください。');

  const menu = await getMenu(env, shop, body.menu_id);
  if (!menu) return error(400, 'メニューを選んでください。');

  const name = clean(body.name, 50);
  const email = clean(body.email, 120);
  const phone = clean(body.phone, 20);
  const note = clean(body.note, 500);
  if (!name) return error(400, 'お名前を入力してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, 'メールアドレスを確認してください。');
  if (!/^[0-9+\-() ]{9,20}$/.test(phone)) return error(400, '電話番号を確認してください（数字とハイフン）。');
  if (!isDate(body.date) || !/^\d{2}:\d{2}$/.test(body.time || '')) return error(400, '日時を選んでください。');

  // 画面に出した時刻のまま予約されるとは限らないので、受け付ける時点でもう一度確かめる
  const slots = await openSlots(env, shop, menu, body.date);
  if (!slots || !slots.includes(body.time)) {
    const hours = await openSlots(env, shop, menu, body.date, { ignoreBooked: true });
    if (!hours || !hours.includes(body.time)) return error(400, 'その日時は予約を受け付けていません。');
    return error(409, '申し訳ありません。その時間はすでに埋まりました。別の時間をお選びください。');
  }

  const start = `${body.date}T${body.time}`;
  const end = addMinutes(start, menu.duration_min);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');

  // 同じ時間の予約数が席の数に満たないときだけ書き込む（同時に予約が入っても数を超えない）
  const result = await insertIfFree(env, shop, {
    menu_id: menu.id, start, end, name, email, phone, note, token,
  });
  if (!result) return error(409, '申し訳ありません。その時間はすでに埋まりました。別の時間をお選びください。');

  const booking = { start, end, name, email, phone, note, token, menu };
  ctx.waitUntil(sendBookingMails(env, shop, booking));
  return json({ ok: true, start, menu: menu.name, cancel_token: token }, 201);
}

async function showBooking(env, token) {
  const b = await findByToken(env, token);
  if (!b) return error(404, 'ご予約が見つかりません。');
  return json({
    shop: b.shop_name,
    shop_phone: b.shop_phone,
    menu: b.menu_name,
    start: b.start_at,
    name: b.customer_name,
    status: b.status,
    cancellable: b.status === 'confirmed' && canCancel(b),
    cancel_deadline: addMinutes(b.start_at, -b.cancel_notice_minutes),
  });
}

async function cancelByCustomer(env, ctx, token) {
  const b = await findByToken(env, token);
  if (!b) return error(404, 'ご予約が見つかりません。');
  if (b.status !== 'confirmed') return error(409, 'このご予約はすでにキャンセルされています。');
  if (!canCancel(b)) return error(409, 'キャンセルの期限を過ぎています。お手数ですが、お店にお電話ください。');

  await env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").bind(b.id).run();
  ctx.waitUntil(sendCancelMails(env, b, 'お客様'));
  return json({ ok: true });
}

/* ---------- 店主向け ---------- */

async function isOwner(request, shop) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  return (await sha256(token)) === shop.admin_token_hash;
}

async function adminList(env, shop, url) {
  const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : nowJst().slice(0, 10);
  const days = Math.min(Number(url.searchParams.get('days')) || 7, 62);
  const to = addDays(from, days);
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.start_at, b.end_at, b.customer_name, b.customer_email, b.customer_phone, b.note, b.status,
            m.name AS menu_name
       FROM bookings b JOIN menus m ON m.id = b.menu_id
      WHERE b.shop_id = ? AND b.start_at >= ? AND b.start_at < ?
      ORDER BY b.start_at`
  ).bind(shop.id, from, to).all();
  const { results: menus } = await env.DB.prepare(
    'SELECT id, name, duration_min FROM menus WHERE shop_id = ? AND active = 1 ORDER BY sort, id'
  ).bind(shop.id).all();
  return json({ shop: shop.name, capacity: shop.capacity, from, to, bookings: results, menus });
}

// 電話で受けた予約や、予約を止めたい時間を店主が書き込む
async function adminCreate(env, shop, request) {
  const body = await readJson(request);
  if (!body) return error(400, '送信内容を読み取れませんでした。');
  const menu = await getMenu(env, shop, body.menu_id);
  if (!menu) return error(400, 'メニューを選んでください。');
  if (!isDate(body.date) || !/^\d{2}:\d{2}$/.test(body.time || '')) return error(400, '日時を入力してください。');
  const name = clean(body.name, 50) || '店頭・電話のご予約';

  const start = `${body.date}T${body.time}`;
  const end = addMinutes(start, menu.duration_min);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const result = await insertIfFree(env, shop, {
    menu_id: menu.id, start, end, name,
    email: clean(body.email, 120), phone: clean(body.phone, 20), note: clean(body.note, 500), token,
  });
  if (!result) return error(409, 'その時間は席が埋まっています。');
  return json({ ok: true }, 201);
}

async function adminCancel(env, ctx, shop, id) {
  const b = await env.DB.prepare(
    `SELECT b.*, s.name AS shop_name, s.email AS shop_email, s.phone AS shop_phone, m.name AS menu_name
       FROM bookings b JOIN shops s ON s.id = b.shop_id JOIN menus m ON m.id = b.menu_id
      WHERE b.id = ? AND b.shop_id = ?`
  ).bind(Number(id), shop.id).first();
  if (!b) return error(404, '予約が見つかりません。');
  if (b.status !== 'confirmed') return error(409, 'すでにキャンセルされています。');
  await env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").bind(b.id).run();
  ctx.waitUntil(sendCancelMails(env, b, 'お店'));
  return json({ ok: true });
}

/* ---------- 空き枠の計算 ---------- */

// その日に予約を始められる時刻の一覧。休業日なら null。
// ignoreBooked を付けると、ほかの予約を無視して営業時間だけで数える
async function openSlots(env, shop, menu, date, { ignoreBooked = false } = {}) {
  const today = nowJst().slice(0, 10);
  if (date < today || date > addDays(today, shop.days_ahead)) return null;

  const closed = await env.DB.prepare('SELECT 1 FROM closed_dates WHERE shop_id = ? AND date = ?').bind(shop.id, date).first();
  if (closed) return null;
  const hours = await env.DB.prepare('SELECT open_time, close_time FROM business_hours WHERE shop_id = ? AND weekday = ?')
    .bind(shop.id, weekdayOf(date)).first();
  if (!hours) return null;

  const { results: booked } = await env.DB.prepare(
    "SELECT start_at, end_at FROM bookings WHERE shop_id = ? AND status = 'confirmed' AND start_at >= ? AND start_at < ?"
  ).bind(shop.id, date, addDays(date, 1)).all();

  const earliest = addMinutes(nowJst(), shop.min_notice_minutes);
  const open = toMinutes(hours.open_time);
  const close = toMinutes(hours.close_time);
  const times = [];
  for (let t = open; t + menu.duration_min <= close; t += shop.slot_minutes) {
    const start = `${date}T${fromMinutes(t)}`;
    if (start < earliest) continue;
    const end = addMinutes(start, menu.duration_min);
    // 予約の時間帯に少しでも重なる予約を数え、席の数に満たなければ空き
    const overlapping = ignoreBooked ? 0 : booked.filter((b) => b.start_at < end && b.end_at > start).length;
    if (overlapping < shop.capacity) times.push(fromMinutes(t));
  }
  return times;
}

// 重なる予約の数を確かめてから書き込むのを、1つの SQL でまとめて行う
async function insertIfFree(env, shop, b) {
  const res = await env.DB.prepare(
    `INSERT INTO bookings (shop_id, menu_id, start_at, end_at, customer_name, customer_email, customer_phone, note, cancel_token)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM bookings
              WHERE shop_id = ? AND status = 'confirmed' AND start_at < ? AND end_at > ?) < ?`
  ).bind(
    shop.id, b.menu_id, b.start, b.end, b.name, b.email || '', b.phone || '', b.note || null, b.token,
    shop.id, b.end, b.start, shop.capacity
  ).run();
  return res.meta.changes === 1;
}

function canCancel(b) {
  return nowJst() <= addMinutes(b.start_at, -b.cancel_notice_minutes);
}

/* ---------- メール ---------- */

// RESEND_API_KEY があれば Resend で送る。なければ送らずにログに残す（開発用）。
async function sendMail(env, to, subject, text) {
  if (!to) return;
  if (!env.RESEND_API_KEY) {
    console.log(`[メール未送信] to=${to} subject=${subject}\n${text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) console.error('メール送信に失敗しました', res.status, await res.text());
}

async function sendBookingMails(env, shop, b) {
  const when = formatJst(b.start);
  const cancelUrl = `${env.PUBLIC_URL}/cancel/${b.token}`;
  const price = b.menu.price != null ? `${b.menu.price.toLocaleString('ja-JP')}円（税込）` : 'お店にお問い合わせください';

  await sendMail(env, b.email, `【${shop.name}】ご予約を承りました`, [
    `${b.name} 様`,
    '',
    `${shop.name}のご予約を承りました。`,
    '',
    `日時：${when}`,
    `メニュー：${b.menu.name}（約${b.menu.duration_min}分）`,
    `料金：${price}`,
    '',
    `キャンセルはこちらから：${cancelUrl}`,
    shop.policy ? `\n${shop.policy}` : '',
    '',
    shop.phone ? `お店の電話：${shop.phone}` : '',
    shop.address ? `住所：${shop.address}` : '',
  ].join('\n'));

  await sendMail(env, shop.email, `新しいご予約：${when} ${b.name} 様`, [
    '予約サイトから新しいご予約が入りました。',
    '',
    `日時：${when}`,
    `メニュー：${b.menu.name}（約${b.menu.duration_min}分）`,
    `お名前：${b.name}`,
    `電話：${b.phone}`,
    `メール：${b.email}`,
    b.note ? `ご要望：${b.note}` : '',
    '',
    `予約の一覧：${env.PUBLIC_URL}/admin/${shop.slug}`,
  ].join('\n'));
}

async function sendCancelMails(env, b, by) {
  const when = formatJst(b.start_at);
  await sendMail(env, b.customer_email, `【${b.shop_name}】ご予約のキャンセル`, [
    `${b.customer_name} 様`,
    '',
    `${when}（${b.menu_name}）のご予約をキャンセルしました。`,
    by === 'お店' && b.shop_phone ? `ご不明な点はお店（${b.shop_phone}）までお問い合わせください。` : 'またのご予約をお待ちしております。',
  ].join('\n'));
  await sendMail(env, b.shop_email, `キャンセル：${when} ${b.customer_name} 様`, [
    `${by}がご予約をキャンセルしました。`,
    '',
    `日時：${when}`,
    `メニュー：${b.menu_name}`,
    `お名前：${b.customer_name}`,
  ].join('\n'));
}

/* ---------- データの取り出し ---------- */

function getShop(env, slug) {
  return env.DB.prepare('SELECT * FROM shops WHERE slug = ?').bind(slug).first();
}

function getMenu(env, shop, id) {
  if (!id) return null;
  return env.DB.prepare('SELECT * FROM menus WHERE id = ? AND shop_id = ? AND active = 1').bind(Number(id), shop.id).first();
}

function findByToken(env, token) {
  return env.DB.prepare(
    `SELECT b.*, s.name AS shop_name, s.email AS shop_email, s.phone AS shop_phone, s.cancel_notice_minutes,
            m.name AS menu_name
       FROM bookings b JOIN shops s ON s.id = b.shop_id JOIN menus m ON m.id = b.menu_id
      WHERE b.cancel_token = ?`
  ).bind(token).first();
}

/* ---------- 日時 ---------- */

function nowJst() {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 16);
}

function addMinutes(dt, minutes) {
  return new Date(new Date(`${dt}:00Z`).getTime() + minutes * 60000).toISOString().slice(0, 16);
}

function addDays(date, days) {
  return addMinutes(`${date}T00:00`, days * 1440).slice(0, 10);
}

function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function formatJst(dt) {
  const w = '日月火水木金土'[weekdayOf(dt.slice(0, 10))];
  const [date, time] = dt.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  return `${y}年${mo}月${d}日（${w}）${time}`;
}

/* ---------- その他 ---------- */

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function error(status, message) {
  return json({ error: message }, status);
}
