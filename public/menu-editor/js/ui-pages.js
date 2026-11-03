// 左パネル「ページ」「レイヤー」

import { el, confirmDialog, uid, clone } from './util.js';
import { newPage, elementLabel } from './model.js';
import { state, update, subscribe, select, currentPage, emit } from './store.js';
import { scrollToPage } from './canvas.js';
import { segmented, numField, section } from './fields.js';

let pagesRoot;
let layersRoot;

export function initPages(pagesEl, layersEl) {
  pagesRoot = pagesEl;
  layersRoot = layersEl;
  subscribe((what) => {
    if (what === 'all' || what === 'page') { renderPages(); renderLayers(); }
    if (what === 'selection') renderLayers();
  });
}

// ページを複製（要素の ID を振り直し、続きのリストの参照も付け替える）
export function duplicatePageData(pg) {
  const copy = clone(pg);
  copy.id = uid('pg');
  const map = new Map();
  for (const e of copy.elements) {
    const nid = uid('el');
    map.set(e.id, nid);
    e.id = nid;
  }
  for (const e of copy.elements) if (e.continueFrom && map.has(e.continueFrom)) e.continueFrom = map.get(e.continueFrom);
  return copy;
}

export function addPage(after = true) {
  const pg = newPage();
  update((p) => {
    const i = p.pages.findIndex((x) => x.id === state.pageId);
    p.pages.splice(after ? i + 1 : p.pages.length, 0, pg);
  });
  state.pageId = pg.id;
  emit('page');
  setTimeout(() => scrollToPage(pg.id), 30);
  return pg;
}

function renderPages() {
  if (!pagesRoot || !state.project) return;
  const p = state.project;
  const list = el('div', { class: 'page-list' }, p.pages.map((pg, i) => el('div', {
    class: `page-item${pg.id === state.pageId ? ' on' : ''}`,
    onclick: (e) => {
      if (e.target.closest('button')) return;
      state.pageId = pg.id;
      select([]);
      emit('page');
      scrollToPage(pg.id);
    },
  },
  el('span', { class: 'page-no' }, `${i + 1}`),
  el('span', { class: 'page-desc' }, `${pg.elements.length}個の要素${pg.background.assetId ? '・背景画像' : ''}${pg.underlay.assetId ? '・下敷き' : ''}`),
  el('span', { class: 'dish-actions' },
    el('button', { class: 'icon-btn', title: '上へ', disabled: i === 0, onclick: () => update((q) => { const [x] = q.pages.splice(i, 1); q.pages.splice(i - 1, 0, x); }) }, '↑'),
    el('button', { class: 'icon-btn', title: '下へ', disabled: i === p.pages.length - 1, onclick: () => update((q) => { const [x] = q.pages.splice(i, 1); q.pages.splice(i + 1, 0, x); }) }, '↓'),
    el('button', { class: 'icon-btn', title: '複製', onclick: () => { const c = duplicatePageData(pg); update((q) => q.pages.splice(i + 1, 0, c)); state.pageId = c.id; emit('page'); } }, '⧉'),
    el('button', { class: 'icon-btn danger', title: '削除', disabled: p.pages.length === 1, onclick: async () => {
      if (!(await confirmDialog('ページを削除', `${i + 1}ページ目を削除しますか？`, '削除する', true))) return;
      update((q) => {
        const ids = new Set(pg.elements.map((e) => e.id));
        q.pages.splice(i, 1);
        for (const x of q.pages) for (const e of x.elements) if (ids.has(e.continueFrom)) e.continueFrom = null;
      });
      state.pageId = state.project.pages[Math.max(0, i - 1)].id;
      emit('page');
    } }, '✕'),
  ))));
  pagesRoot.replaceChildren(
    section('用紙',
      segmented(p.paper.orientation, [{ value: 'portrait', label: 'A4 縦' }, { value: 'landscape', label: 'A4 横' }], (v) => update((q) => { q.paper.orientation = v; })),
      numField('印刷できない余白（目安）', p.safeMargin, (v) => update((q) => { q.safeMargin = Math.max(0, v); }, { key: 'margin', render: 'canvas' }), { step: 1, min: 0, max: 20, unit: 'mm', title: '家庭用プリンターは端の数mmを印刷できないことがあります。この範囲に文字があると注意を表示します。' }),
    ),
    section('ページ', list,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn small primary', onclick: () => addPage(true) }, '＋ ページを追加'))),
  );
}

function layerRow(pg, e, index) {
  const on = state.selection.includes(e.id);
  return el('div', {
    class: `layer${on ? ' on' : ''}${e.hidden ? ' is-hidden' : ''}`,
    onclick: (ev) => {
      if (ev.target.closest('button')) return;
      select([e.id], { additive: ev.shiftKey || ev.metaKey || ev.ctrlKey });
    },
  },
  el('span', { class: 'layer-type' }, { text: '文', image: e.role === 'photo' ? '写' : '画', shape: '形', menu: '品' }[e.type] || '?'),
  el('span', { class: 'layer-name' }, elementLabel(e)),
  el('button', { class: `icon-btn${e.hidden ? ' off' : ''}`, title: e.hidden ? '表示する' : '隠す', onclick: () => update((q) => { const x = q.pages.find((y) => y.id === pg.id).elements[index]; x.hidden = !x.hidden; }) }, e.hidden ? '◌' : '◉'),
  el('button', { class: `icon-btn${e.locked ? ' locked' : ''}`, title: e.locked ? 'ロックを解除' : 'ロック（誤操作を防ぐ）', onclick: () => update((q) => { const x = q.pages.find((y) => y.id === pg.id).elements[index]; x.locked = !x.locked; }) }, e.locked ? '🔒' : '🔓'));
}

function renderLayers() {
  if (!layersRoot || !state.project) return;
  const pg = currentPage();
  const p = state.project;
  const idx = p.pages.indexOf(pg);
  const rows = pg.elements.map((e, i) => layerRow(pg, e, i)).reverse();
  const bg = el('div', { class: 'layer bg' },
    el('span', { class: 'layer-type' }, '背'),
    el('span', { class: 'layer-name' }, pg.background.assetId ? '背景（画像）' : '背景（色）'),
    el('button', { class: 'icon-btn', title: '背景の設定', onclick: () => select([]) }, '⚙'),
    el('button', { class: `icon-btn${pg.background.locked ? ' locked' : ''}`, title: pg.background.locked ? '背景のロックを解除' : '背景をロック', onclick: () => update((q) => { const x = q.pages[idx]; x.background.locked = !x.background.locked; }) }, pg.background.locked ? '🔒' : '🔓'));
  const under = pg.underlay.assetId ? el('div', { class: 'layer bg' },
    el('span', { class: 'layer-type' }, '下'),
    el('span', { class: 'layer-name' }, '下敷き（印刷されません）'),
    el('button', { class: `icon-btn${pg.underlay.visible ? '' : ' off'}`, title: pg.underlay.visible ? '下敷きを隠す' : '下敷きを表示', onclick: () => update((q) => { q.pages[idx].underlay.visible = !q.pages[idx].underlay.visible; }) }, pg.underlay.visible ? '◉' : '◌')) : null;
  layersRoot.replaceChildren(
    el('p', { class: 'panel-help' }, `${idx + 1}ページ目の要素（上にあるものほど前面）。ロックした要素はページ上でクリックしても選択されません。ここから選んで編集できます。`),
    el('div', { class: 'layer-list' }, rows.length ? rows : el('p', { class: 'muted pad' }, '要素がありません'), under, bg),
  );
}
