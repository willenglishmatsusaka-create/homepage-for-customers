// 要素の操作（追加・複製・削除・重なり順・整列・次ページへ続ける）

import { uid, clone, round, toast } from './util.js';
import { newText, newPhotoFrame, newShape, newLine, newMenuList, newPage, newImage, pageSize, textStyle } from './model.js';
import { boundingBox } from './render.js';
import { state, update, select, currentPage, selectedElements, emit } from './store.js';
import { assetInfo } from './db.js';
import { scrollToPage } from './canvas.js';

function centerOfPage(w, h) {
  const s = pageSize(state.project);
  return { x: round((s.w - w) / 2), y: round((s.h - h) / 2) };
}

export function addElement(kind) {
  const pg = currentPage();
  let e;
  switch (kind) {
    case 'text': e = newText({ text: '文字を入力', w: 80, h: 12, style: textStyle({ size: 14 }) }); break;
    case 'heading': e = newText({ text: '見出し', name: '見出し', w: 120, h: 16, style: textStyle({ size: 24, align: 'center', letterSpacing: 0.2 }) }); break;
    case 'photo': e = newPhotoFrame({}); break;
    case 'image': e = newImage({ w: 50, h: 50, name: '画像' }); break;
    case 'rect': e = newShape({ w: 60, h: 30, fill: '#ffffff', name: '四角形（隠す用にも）' }); break;
    case 'ellipse': e = newShape({ shape: 'ellipse', w: 30, h: 30, fill: '#e9e2d6' }); break;
    case 'line': e = newLine({ w: 80 }); break;
    case 'menu': e = newMenuList({ w: 150, h: 180 }); break;
    default: return null;
  }
  const c = centerOfPage(e.w, e.h);
  e.x = c.x;
  e.y = c.y;
  update((p) => p.pages.find((x) => x.id === pg.id).elements.push(e));
  select([e.id]);
  return e;
}

function eachSelected(p, fn) {
  const ids = new Set(state.selection);
  for (const pg of p.pages) pg.elements.forEach((e, i) => ids.has(e.id) && fn(e, pg, i));
}

export function deleteSelected() {
  const items = selectedElements().filter((e) => !e.locked);
  if (!items.length) {
    if (state.selection.length) toast('ロック中の要素は削除できません。ロックを解除してください。');
    return;
  }
  const ids = new Set(items.map((e) => e.id));
  update((p) => {
    for (const pg of p.pages) {
      pg.elements = pg.elements.filter((e) => !ids.has(e.id));
      for (const e of pg.elements) if (ids.has(e.continueFrom)) e.continueFrom = null;
    }
  });
  select([]);
}

export function duplicateSelected(offset = 5) {
  const out = [];
  update((p) => {
    for (const pg of p.pages) {
      const add = [];
      for (const e of pg.elements) {
        if (!state.selection.includes(e.id)) continue;
        const c = clone(e);
        c.id = uid('el');
        c.x = round(c.x + offset);
        c.y = round(c.y + offset);
        c.locked = false;
        c.continueFrom = null;
        add.push(c);
      }
      pg.elements.push(...add);
      out.push(...add);
    }
  });
  select(out.map((e) => e.id));
}

let clipboard = [];
export function copySelected() {
  clipboard = selectedElements().map(clone);
  if (clipboard.length) toast(`${clipboard.length}個の要素をコピーしました`);
}
export function paste() {
  if (!clipboard.length) return;
  const pg = currentPage();
  const items = clipboard.map((e) => ({ ...clone(e), id: uid('el'), x: round(e.x + 5), y: round(e.y + 5), locked: false, continueFrom: null }));
  update((p) => p.pages.find((x) => x.id === pg.id).elements.push(...items));
  clipboard = items.map(clone);
  select(items.map((e) => e.id));
}

export function reorder(where) {
  update((p) => {
    for (const pg of p.pages) {
      const sel = pg.elements.filter((e) => state.selection.includes(e.id));
      if (!sel.length) continue;
      if (where === 'front' || where === 'back') {
        const rest = pg.elements.filter((e) => !state.selection.includes(e.id));
        pg.elements = where === 'front' ? [...rest, ...sel] : [...sel, ...rest];
      } else {
        const arr = pg.elements;
        const idxs = arr.map((e, i) => (state.selection.includes(e.id) ? i : -1)).filter((i) => i >= 0);
        if (where === 'forward') {
          for (const i of idxs.reverse()) if (i < arr.length - 1 && !state.selection.includes(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        } else {
          for (const i of idxs) if (i > 0 && !state.selection.includes(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
    }
  });
}

// 整列：1つならページ基準、複数なら選択範囲基準
export function align(how) {
  const items = selectedElements().filter((e) => !e.locked);
  if (!items.length) return;
  const s = pageSize(state.project);
  let ref;
  if (items.length === 1) ref = { x1: 0, y1: 0, x2: s.w, y2: s.h };
  else ref = items.map(boundingBox).reduce((a, b) => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }));
  update((p) => {
    eachSelected(p, (e) => {
      if (e.locked) return;
      const b = boundingBox(e);
      const ox = e.x - b.x1;
      const oy = e.y - b.y1;
      const bw = b.x2 - b.x1;
      const bh = b.y2 - b.y1;
      if (how === 'left') e.x = round(ref.x1 + ox, 2);
      if (how === 'center') e.x = round((ref.x1 + ref.x2) / 2 - bw / 2 + ox, 2);
      if (how === 'right') e.x = round(ref.x2 - bw + ox, 2);
      if (how === 'top') e.y = round(ref.y1 + oy, 2);
      if (how === 'middle') e.y = round((ref.y1 + ref.y2) / 2 - bh / 2 + oy, 2);
      if (how === 'bottom') e.y = round(ref.y2 - bh + oy, 2);
    });
  });
}

export function distribute(axis) {
  const items = selectedElements().filter((e) => !e.locked);
  if (items.length < 3) {
    toast('3つ以上選ぶと、間隔をそろえられます。');
    return;
  }
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...items].sort((a, b) => a[key] - b[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const total = sorted.reduce((s, e) => s + e[size], 0);
  const gap = (last[key] + last[size] - first[key] - total) / (sorted.length - 1);
  const pos = new Map();
  let cur = first[key];
  for (const e of sorted) {
    pos.set(e.id, round(cur, 2));
    cur += e[size] + gap;
  }
  update((p) => eachSelected(p, (e) => { if (pos.has(e.id)) e[key] = pos.get(e.id); }));
}

export function nudge(dx, dy) {
  if (!state.selection.length) return;
  update((p) => eachSelected(p, (e) => {
    if (e.locked) return;
    e.x = round(e.x + dx, 2);
    e.y = round(e.y + dy, 2);
  }), { key: 'nudge' });
}

// 料理リストからあふれた料理を次のページへ（続きのリストを作る）
export function continueOnNextPage(menuId) {
  const p = state.project;
  const pi = p.pages.findIndex((pg) => pg.elements.some((e) => e.id === menuId));
  if (pi < 0) return;
  const src = p.pages[pi].elements.find((e) => e.id === menuId);
  const existing = p.pages.flatMap((pg) => pg.elements).find((e) => e.continueFrom === menuId);
  if (existing) {
    toast('この料理リストには、すでに続きのリストがあります。');
    return;
  }
  const cont = clone(src);
  cont.id = uid('el');
  cont.continueFrom = menuId;
  cont.name = '料理リスト（続き）';
  cont.locked = false;
  let targetId;
  update((q) => {
    let target = q.pages[pi + 1];
    if (!target) {
      // 背景と、ロック済みの装飾（枠など）は引き継いで新しいページを作る
      target = newPage({ background: clone(q.pages[pi].background) });
      target.elements = q.pages[pi].elements
        .filter((e) => e.locked && e.type !== 'menu')
        .map((e) => ({ ...clone(e), id: uid('el') }));
      q.pages.splice(pi + 1, 0, target);
    }
    // 上に置いた見出しなどと重ならないように、次のページで空いている所に置く
    const s = pageSize(q);
    cont.y = Math.min(cont.y, Math.max(q.safeMargin + 10, 20));
    cont.h = Math.min(s.h - cont.y - q.safeMargin - 10, Math.max(cont.h, s.h * 0.7));
    target.elements.push(cont);
    targetId = target.id;
  });
  state.pageId = targetId;
  select([cont.id]);
  emit('page');
  setTimeout(() => scrollToPage(targetId), 50);
  toast('次のページに続きの料理リストを作りました。料理を増やすと自動で続きに流れます。', 'success');
}

export function setImageAsBackground(id) {
  update((p) => {
    for (const pg of p.pages) {
      const i = pg.elements.findIndex((e) => e.id === id);
      if (i < 0) continue;
      const e = pg.elements[i];
      if (!e.assetId) return;
      pg.background = { ...pg.background, assetId: e.assetId, fit: 'cover', locked: true, opacity: e.opacity ?? 1 };
      pg.elements.splice(i, 1);
    }
  });
  select([]);
  toast('ページの背景に設定し、ロックしました。');
}

export function fitFrameToImage(id) {
  update((p) => {
    for (const pg of p.pages) {
      const e = pg.elements.find((x) => x.id === id);
      if (!e) continue;
      const info = assetInfo(e.assetId);
      if (!info) return;
      const r = info.width / info.height;
      e.h = round(e.w / r, 2);
      e.crop = { x: 0.5, y: 0.5, zoom: 1 };
    }
  });
}
