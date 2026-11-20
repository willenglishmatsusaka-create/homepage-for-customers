// 共通の小さな道具

export const MM_TO_PX = 96 / 25.4; // CSS の 1mm = 3.7795px

export const PAPERS = {
  A4: { w: 210, h: 297, label: 'A4' },
};

export function paperSize(paper) {
  const base = PAPERS[paper.size] || PAPERS.A4;
  return paper.orientation === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
}

export function uid(prefix = 'id') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${r[0].toString(36)}${r[1].toString(36)}`;
}

export const clone = (o) => structuredClone(o);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// 価格の表示：数字だけなら「¥1,200」、それ以外（時価など）はそのまま
export function formatPrice(price, format = 'yen') {
  const s = String(price ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/[,，]/g, '');
  if (format === 'yen' && /^[0-9０-９]+$/.test(digits)) {
    const n = Number(digits.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
    return `¥${n.toLocaleString('ja-JP')}`;
  }
  return s;
}

/**
 * ファイルを保存する。保存先を選べるブラウザ（Chrome・Edge）では保存場所の選択画面を出す。
 * fallbackName は日本語を含まない名前（一部の環境で日本語のファイル名が使えないため）。
 * 戻り値: 保存した名前（キャンセル時は null）
 */
export async function saveFile(blob, filename, fallbackName, accept = { 'application/json': ['.json'] }) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'バックアップファイル', accept }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle.name;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      console.warn(err);
    }
  }
  downloadBlob(blob, fallbackName || filename);
  return fallbackName || filename;
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function safeFileName(name) {
  return String(name || 'menu').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
}

export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve([...input.files]));
    input.click();
  });
}

let toastTimer;
export function toast(message, kind = 'info') {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status' });
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.className = ''), kind === 'error' ? 6000 : 3000);
}

// シンプルなダイアログ。buttons: [{label, value, primary}]
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], wide = false }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const content = typeof body === 'string' ? el('p', {}, body) : body;
    const close = (v) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    const modal = el(
      'div',
      { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
      el('h2', {}, title),
      el('div', { class: 'modal-body' }, content),
      el(
        'div',
        { class: 'modal-actions' },
        buttons.map((b) =>
          el('button', { class: b.primary ? 'btn primary' : b.danger ? 'btn danger' : 'btn', onclick: () => close(b.value) }, b.label),
        ),
      ),
    );
    backdrop.append(modal);
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close(null));
    document.addEventListener('keydown', onKey, true);
    document.body.append(backdrop);
    modal.querySelector('.btn.primary, .btn')?.focus();
  });
}

export const confirmDialog = (title, body, okLabel = 'OK', danger = false) =>
  dialog({
    title,
    body,
    buttons: [
      { label: 'キャンセル', value: false },
      { label: okLabel, value: true, primary: !danger, danger },
    ],
  });

export async function promptDialog(title, label, value = '') {
  const input = el('input', { type: 'text', value, class: 'input' });
  const body = el('label', { class: 'field' }, el('span', {}, label), input);
  setTimeout(() => {
    input.focus();
    input.select();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') body.closest('.modal').querySelector('.btn.primary').click();
  });
  const ok = await dialog({
    title,
    body,
    buttons: [
      { label: 'キャンセル', value: false },
      { label: 'OK', value: true, primary: true },
    ],
  });
  return ok ? input.value.trim() : null;
}
