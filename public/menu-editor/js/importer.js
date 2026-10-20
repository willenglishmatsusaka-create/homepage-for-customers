// 既存メニュー（画像・PDF）の取り込み

import { el, dialog, toast, pickFiles } from './util.js';
import { addImageFile, isPdfFile, isImageFile, IMAGE_ACCEPT } from './assets.js';
import { assetURL } from './db.js';
import { newPage } from './model.js';
import { state, update } from './store.js';

const PDF_BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
let pdfjsPromise;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`${PDF_BASE}pdf.min.mjs`).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDF_BASE}pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsPromise;
}

async function openPdf(file) {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({
    data,
    cMapUrl: `${PDF_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDF_BASE}standard_fonts/`,
    wasmUrl: `${PDF_BASE}wasm/`,
    iccUrl: `${PDF_BASE}iccs/`,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  return { pdf, close: () => task.destroy() };
}

async function renderPdfPage(pdf, n, { maxSide = 3508, dpi = 300 } = {}) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  let scale = dpi / 72;
  scale = Math.min(scale, maxSide / Math.max(v1.width, v1.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

const canvasToBlob = (canvas, type = 'image/jpeg', q = 0.93) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, q));

async function choosePdfPages(pdf, fileName) {
  const grid = el('div', { class: 'pdf-grid' });
  const checks = [];
  const body = el('div', {},
    el('p', {}, `「${fileName}」は${pdf.numPages}ページあります。取り込むページを選んでください。`),
    el('div', { class: 'row gap' },
      el('button', { class: 'btn small', onclick: () => checks.forEach((c) => (c.checked = true)) }, 'すべて選ぶ'),
      el('button', { class: 'btn small', onclick: () => checks.forEach((c) => (c.checked = false)) }, 'すべて外す'),
    ),
    grid,
  );
  for (let n = 1; n <= pdf.numPages; n++) {
    const cb = el('input', { type: 'checkbox', checked: n === 1 });
    checks.push(cb);
    const thumb = el('div', { class: 'pdf-thumb-img' }, '読み込み中…');
    grid.append(el('label', { class: 'pdf-thumb' }, thumb, el('span', {}, cb, ` ${n}ページ`)));
    renderPdfPage(pdf, n, { maxSide: 260, dpi: 40 }).then((c) => thumb.replaceChildren(c)).catch(() => (thumb.textContent = '表示できません'));
  }
  const ok = await dialog({
    title: 'PDFのページを選ぶ',
    body,
    wide: true,
    buttons: [{ label: 'キャンセル', value: false }, { label: '取り込む', value: true, primary: true }],
  });
  if (!ok) return [];
  return checks.map((c, i) => (c.checked ? i + 1 : 0)).filter(Boolean);
}

async function chooseUsage(assets) {
  const preview = el('div', { class: 'import-preview' }, assets.slice(0, 6).map((a) => el('img', { src: assetURL(a.id), alt: '' })));
  const landscape = assets[0].width > assets[0].height;
  const paperIsLandscape = state.project.paper.orientation === 'landscape';
  const orient = el('label', { class: 'check' },
    el('input', { type: 'checkbox', checked: landscape !== paperIsLandscape, id: 'imp-orient' }),
    ` 用紙の向きを取り込んだメニューに合わせる（${landscape ? 'A4横' : 'A4縦'}）`);
  const fitSel = el('select', { class: 'input' },
    el('option', { value: 'contain' }, '縦横比を保って用紙に収める（余白ができることがあります）'),
    el('option', { value: 'cover' }, '縦横比を保って用紙いっぱいに広げる（端が切れることがあります）'));
  const where = el('select', { class: 'input' },
    el('option', { value: 'current' }, '今のページから順に使う（足りないページは追加）'),
    el('option', { value: 'new' }, '新しいページを追加して使う'));
  const body = el('div', {},
    preview,
    el('p', { class: 'muted' }, `${assets.length}ページ分を取り込みました。使い方を選んでください。`),
    el('div', { class: 'usage-cards' },
      el('div', { class: 'usage-card' },
        el('h3', {}, 'A. 下敷きにして作り直す（おすすめ）'),
        el('p', {}, '元のメニューを半透明で表示し、その上に文字・写真枠・線を置き直します。料理情報と紐付ければ、あとは料理を変えるだけで更新できます。下敷きは印刷されません。')),
      el('div', { class: 'usage-card' },
        el('h3', {}, 'B. 背景として使う'),
        el('p', {}, '元のデザインをそのまま背景に固定し、変えたい文字や写真だけを上に置きます。元の文字は図形で隠す必要があります（柄や写真の上は単色で自然に隠せないことがあります）。'))),
    el('label', { class: 'field' }, el('span', {}, '配置のしかた'), fitSel),
    el('label', { class: 'field' }, el('span', {}, 'ページ'), where),
    orient,
  );
  const usage = await dialog({
    title: '取り込んだメニューの使い方',
    body,
    wide: true,
    buttons: [
      { label: 'キャンセル', value: null },
      { label: 'B. 背景として使う', value: 'background' },
      { label: 'A. 下敷きにして作り直す', value: 'underlay', primary: true },
    ],
  });
  if (!usage) return null;
  return { usage, fit: fitSel.value, where: where.value, orient: orient.querySelector('input').checked ? (landscape ? 'landscape' : 'portrait') : null };
}

export function applyImported(assets, { usage, fit, where, orient }) {
  update((p) => {
    if (orient) p.paper.orientation = orient;
    let idx = where === 'current' ? p.pages.findIndex((pg) => pg.id === state.pageId) : p.pages.length;
    if (idx < 0) idx = 0;
    assets.forEach((a, i) => {
      let pg = p.pages[idx + i];
      if (!pg || (where === 'new')) {
        pg = newPage();
        p.pages.splice(idx + i, 0, pg);
      }
      if (usage === 'background') {
        pg.background = { ...pg.background, assetId: a.id, fit, locked: true, opacity: 1 };
      } else {
        pg.underlay = { ...pg.underlay, assetId: a.id, opacity: 0.5, visible: true, fit };
      }
      if (i === 0) state.pageId = pg.id;
    });
    p.libraryAssetIds = [...new Set([...(p.libraryAssetIds || []), ...assets.map((a) => a.id)])];
  });
  toast(usage === 'background'
    ? '背景に設定してロックしました。上に文字や写真を置いてください。'
    : '下敷きを表示しました。右の「ページ設定」で透明度を変えられます。', 'success');
}

// 取り込みの入口：ファイル選択 → (PDFならページ選択) → 使い方を選ぶ
export async function importExistingMenu(files) {
  if (!files) files = await pickFiles({ accept: `${IMAGE_ACCEPT},.pdf,application/pdf`, multiple: true });
  if (!files.length) return;
  const assets = [];
  for (const f of files) {
    try {
      if (isPdfFile(f)) {
        toast('PDFを読み込んでいます…');
        const { pdf, close } = await openPdf(f);
        try {
          const pages = pdf.numPages === 1 ? [1] : await choosePdfPages(pdf, f.name);
          for (const n of pages) {
            toast(`${n}ページ目を画像にしています…`);
            const canvas = await renderPdfPage(pdf, n);
            const blob = await canvasToBlob(canvas);
            const base = f.name.replace(/\.pdf$/i, '');
            assets.push(await addImageFile(new File([blob], `${base}_p${n}.jpg`, { type: 'image/jpeg' }), 'import'));
          }
        } finally {
          close();
        }
      } else if (isImageFile(f)) {
        assets.push(await addImageFile(f, 'import'));
      } else {
        toast(`「${f.name}」は取り込めません（JPEG・PNG・WebP・PDF に対応）`, 'error');
      }
    } catch (err) {
      console.error(err);
      toast(`「${f.name}」を読み込めませんでした：${err.message}`, 'error');
    }
  }
  if (!assets.length) return;
  const choice = await chooseUsage(assets);
  if (!choice) {
    update((p) => { p.libraryAssetIds = [...new Set([...(p.libraryAssetIds || []), ...assets.map((a) => a.id)])]; });
    toast('素材一覧に保存しました。');
    return;
  }
  applyImported(assets, choice);
}
