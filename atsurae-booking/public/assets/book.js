// お客様の予約画面。URL の /book/:slug からお店を読み込む
const slug = location.pathname.split('/').filter(Boolean)[1];
const api = (path) => `/api/shops/${slug}${path}`;
const $ = (id) => document.getElementById(id);

const state = { shop: null, menu: null, from: null, date: null, time: null };
const WEEK = '日月火水木金土';

const yen = (n) => (n == null ? '料金はお問い合わせ' : `${n.toLocaleString('ja-JP')}円`);
const jpDate = (date) => {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日（${WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
};
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

async function getJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '通信に失敗しました。'), { status: res.status });
  return data;
}

function enable(id, on) {
  $(id).setAttribute('aria-disabled', on ? 'false' : 'true');
}

function press(container, button) {
  container.querySelectorAll('[aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  button.setAttribute('aria-pressed', 'true');
}

async function loadShop() {
  try {
    state.shop = await getJson(api(''));
  } catch (e) {
    $('menus').innerHTML = '';
    $('menus').append(Object.assign(document.createElement('p'), { className: 'message error', textContent: e.message }));
    return;
  }
  const s = state.shop;
  document.title = `ご予約｜${s.name}`;
  document.documentElement.style.setProperty('--accent', s.accent);
  $('shop-name').textContent = s.name;
  $('shop-sub').textContent = [s.address, s.phone && `TEL ${s.phone}`].filter(Boolean).join('　');
  $('policy').textContent = s.policy || '';

  const box = $('menus');
  box.innerHTML = '';
  s.menus.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<strong></strong><span class="price"></span><small></small>';
    b.querySelector('strong').textContent = m.name;
    b.querySelector('.price').textContent = yen(m.price);
    b.querySelector('small').textContent = `約${m.duration_min}分${m.description ? '・' + m.description : ''}`;
    b.addEventListener('click', () => {
      press(box, b);
      state.menu = m;
      state.date = state.time = null;
      state.from = todayJst();
      enable('step-day', true);
      enable('step-time', false);
      enable('step-form', false);
      loadDays();
    });
    box.append(b);
  });
}

async function loadDays() {
  const box = $('days');
  box.innerHTML = '';
  $('prev-week').disabled = state.from <= todayJst();
  $('range').textContent = `${jpDate(state.from)}〜`;
  const { days } = await getJson(api(`/calendar?menu=${state.menu.id}&from=${state.from}&days=7`));
  days.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `day${d.weekday === 0 ? ' sun' : d.weekday === 6 ? ' sat' : ''}`;
    b.setAttribute('aria-pressed', String(d.date === state.date));
    const [, m, day] = d.date.split('-').map(Number);
    const mark = d.available === null ? '休' : d.available === 0 ? '×' : d.available <= 3 ? '△' : '○';
    b.innerHTML = `<span class="w">${WEEK[d.weekday]}</span><span class="d">${m}/${day}</span><span class="mark">${mark}</span>`;
    b.setAttribute('aria-label', `${jpDate(d.date)} ${d.available === null ? '定休日' : d.available === 0 ? '満席' : '空きあり'}`);
    b.disabled = !d.available;
    b.addEventListener('click', () => {
      press(box, b);
      state.date = d.date;
      state.time = null;
      enable('step-time', true);
      enable('step-form', false);
      loadTimes();
    });
    box.append(b);
  });
}

async function loadTimes() {
  const box = $('times');
  box.innerHTML = '';
  const { times } = await getJson(api(`/availability?menu=${state.menu.id}&date=${state.date}`));
  if (!times.length) {
    box.innerHTML = '<p class="empty">この日は空いている時間がありません。</p>';
    return;
  }
  times.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'time';
    b.textContent = t;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      press(box, b);
      state.time = t;
      enable('step-form', true);
      renderSummary($('summary'));
      $('step-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.append(b);
  });
}

function renderSummary(dl) {
  const rows = [
    ['日時', `${jpDate(state.date)} ${state.time}`],
    ['メニュー', `${state.menu.name}（約${state.menu.duration_min}分）`],
    ['料金', yen(state.menu.price)],
  ];
  dl.innerHTML = '';
  rows.forEach(([k, v]) => {
    dl.append(Object.assign(document.createElement('dt'), { textContent: k }));
    dl.append(Object.assign(document.createElement('dd'), { textContent: v }));
  });
}

$('prev-week').addEventListener('click', () => { state.from = addDays(state.from, -7); loadDays(); });
$('next-week').addEventListener('click', () => { state.from = addDays(state.from, 7); loadDays(); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('error');
  err.hidden = true;
  if (!f.name.value.trim() || !f.email.value.trim() || !f.phone.value.trim()) {
    err.textContent = 'お名前、メールアドレス、電話番号を入力してください。';
    err.hidden = false;
    return;
  }
  $('submit').disabled = true;
  $('submit').textContent = '送信しています…';
  try {
    await getJson(api('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_id: state.menu.id, date: state.date, time: state.time,
        name: f.name.value, email: f.email.value, phone: f.phone.value, note: f.note.value, website: f.website.value,
      }),
    });
    renderSummary($('done-summary'));
    $('booking').hidden = true;
    $('done').hidden = false;
    window.scrollTo({ top: 0 });
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
    // ほかの方が先に予約していたら、時間を選び直してもらう
    if (e2.status === 409) {
      state.time = null;
      enable('step-form', false);
      loadTimes();
      $('step-time').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } finally {
    $('submit').disabled = false;
    $('submit').textContent = 'この内容で予約する';
  }
});

loadShop();
