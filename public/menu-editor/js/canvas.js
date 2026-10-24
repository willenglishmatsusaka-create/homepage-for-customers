// 編集・プレビュー画面（ページの表示、選択、移動、拡大縮小、回転、トリミング、ドロップ）

import { el, clamp, round, toast } from './util.js';
import { renderDocument, imageLayout, boundingBox } from './render.js';
import { assetInfo } from './db.js';
import { newImage, newText, newPhotoFrame, pageSize, textStyle } from './model.js';
import { addImageFiles, isImageFile, isPdfFile } from './assets.js';
import { importExistingMenu } from './importer.js';
import {
  state, subscribe, update, checkpoint, mutateQuiet, findElement, select, currentPage, emit,
} from './store.js';

export const view = { issues: [], doc: null, showGuides: true };

let scroller, sizer, stage;
const SNAP_MM = 1.6;
const PAGE_GAP_PX = 48;

export function initCanvas(container) {
  scroller = container;
  sizer = el('div', { class: 'canvas-sizer' });
  stage = el('div', { class: 'canvas-stage' });
  sizer.append(stage);
  scroller.append(sizer);

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('dblclick', onDoubleClick);
  scroller.addEventListener('pointerdown', (e) => {
    if (e.target === scroller || e.target === sizer) {
      select([]);
    }
  });
  scroller.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
  scroller.addEventListener('dragover', (e) => {
    if (!hasDropData(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    markDropTarget(e);
  });
  scroller.addEventListener('dragleave', () => markDropTarget(null));
  scroller.addEventListener('drop', onDrop);
  document.fonts?.addEventListener?.('loadingdone', () => refreshFlow());

  subscribe((what) => {
    if (what === 'all' || what === 'canvas') renderAll();
    else if (what === 'selection') renderOverlays();
  });
}

// ─── 描画 ───────────────────────────────────────────

let flowRaf = 0;
export function renderAll() {
  const p = state.project;
  if (!p || !stage) return;
  const tmp = el('div');
  const doc = renderDocument(p, tmp, 'edit');
  view.doc = doc;
  view.issues = doc.issues;
  const size = pageSize(p);
  stage.replaceChildren();
  for (const [pageId, page] of doc.pages) {
    const index = p.pages.findIndex((x) => x.id === pageId);
    const wrap = el('div', { class: `page-wrap${pageId === state.pageId ? ' is-current' : ''}`, dataset: { page: pageId } },
      el('div', { class: 'page-label' }, `${index + 1} / ${p.pages.length} ページ`),
    );
    wrap.style.width = `${size.w}mm`;
    wrap.style.height = `${size.h}mm`;
    wrap.style.marginBottom = `${PAGE_GAP_PX}px`;
    wrap.append(page, el('div', { class: 'overlay' }));
    stage.append(wrap);
  }
  doc.flow();
  applyZoom();
  renderOverlays();
  emit('issues');
  // 画像の読み込み後にもう一度はみ出しを計算
  const pending = [...stage.querySelectorAll('img')].filter((i) => !i.complete);
  if (pending.length) Promise.all(pending.map((i) => i.decode().catch(() => {}))).then(refreshFlow);
}

function refreshFlow() {
  cancelAnimationFrame(flowRaf);
  flowRaf = requestAnimationFrame(() => {
    if (!view.doc) return;
    view.doc.flow();
    renderOverlays();
    emit('issues');
  });
}

function applyZoom() {
  const p = state.project;
  if (!p) return;
  const size = pageSize(p);
  const pxW = size.w * (96 / 25.4);
  const n = p.pages.length;
  const pxH = n * (size.h * (96 / 25.4) + PAGE_GAP_PX + 28);
  stage.style.transform = `scale(${state.zoom})`;
  stage.style.setProperty('--inv', String(1 / state.zoom));
  sizer.style.width = `${pxW * state.zoom + 80}px`;
  sizer.style.height = `${pxH * state.zoom + 40}px`;
}

export function setZoom(z) {
  state.zoom = clamp(z, 0.25, 4);
  applyZoom();
  emit('zoom');
}

export function zoomToFit() {
  const p = state.project;
  if (!p || !scroller) return;
  const size = pageSize(p);
  const pxW = size.w * (96 / 25.4);
  const pxH = size.h * (96 / 25.4);
  const z = Math.min((scroller.clientWidth - 80) / pxW, (scroller.clientHeight - 70) / pxH);
  setZoom(z);
}

export function scrollToPage(pageId) {
  const wrap = stage?.querySelector(`.page-wrap[data-page="${pageId}"]`);
  if (wrap) scroller.scrollTo({ top: wrap.offsetTop * state.zoom - 10, behavior: 'smooth' });
}

export function scrollToElement(id) {
  const f = findElement(id);
  if (!f) return;
  state.pageId = f.page.id;
  select([id]);
  scrollToPage(f.page.id);
}

function overlayFor(pageId) {
  return stage.querySelector(`.page-wrap[data-page="${pageId}"] .overlay`);
}

export function renderOverlays() {
  if (!stage || !state.project) return;
  for (const wrap of stage.querySelectorAll('.page-wrap')) {
    wrap.classList.toggle('is-current', wrap.dataset.page === state.pageId);
    const ov = wrap.querySelector('.overlay');
    ov.replaceChildren();
    if (view.showGuides) {
      const m = state.project.safeMargin;
      const g = el('div', { class: 'safe-area' });
      Object.assign(g.style, { left: `${m}mm`, top: `${m}mm`, right: `${m}mm`, bottom: `${m}mm` });
      ov.append(g);
    }
  }
  const single = state.selection.length === 1;
  for (const id of state.selection) {
    const f = findElement(id);
    if (!f) continue;
    const ov = overlayFor(f.page.id);
    if (!ov) continue;
    const e = f.element;
    const box = el('div', { class: `sel-box${e.locked ? ' locked' : ''}${state.cropMode === id ? ' cropping' : ''}`, dataset: { id } });
    Object.assign(box.style, { left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${e.h}mm`, transform: e.rotation ? `rotate(${e.rotation}deg)` : '' });
    if (e.locked) box.append(el('span', { class: 'lock-badge', title: 'ロック中' }, '🔒'));
    else if (single && state.cropMode !== id) {
      for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) box.append(el('div', { class: `handle h-${h}`, dataset: { handle: h } }));
      box.append(el('div', { class: 'handle rot', dataset: { handle: 'rot' }, title: '回転' }));
    }
    if (state.cropMode === id) box.append(el('span', { class: 'crop-badge' }, 'ドラッグで位置を調整（Enterで終了）'));
    if (e.binding) box.append(el('span', { class: 'bind-badge', title: '料理情報と紐付け中' }, '🔗'));
    ov.append(box);
  }
}

function showGuides(pageId, guides) {
  const ov = overlayFor(pageId);
  if (!ov) return;
  ov.querySelectorAll('.guide').forEach((g) => g.remove());
  for (const g of guides) {
    const line = el('div', { class: `guide ${g.axis}` });
    if (g.axis === 'v') line.style.left = `${g.pos}mm`;
    else line.style.top = `${g.pos}mm`;
    ov.append(line);
  }
}

// ─── 座標 ───────────────────────────────────────────

function pagePoint(wrap, ev) {
  const r = wrap.getBoundingClientRect();
  const size = pageSize(state.project);
  return { x: ((ev.clientX - r.left) / r.width) * size.w, y: ((ev.clientY - r.top) / r.height) * size.h };
}

function topElementAt(ev, pageId) {
  const pg = state.project.pages.find((p) => p.id === pageId);
  const hits = document.elementsFromPoint(ev.clientX, ev.clientY);
  for (const node of hits) {
    const elNode = node.closest?.('.mp-el');
    if (!elNode) continue;
    const e = pg.elements.find((x) => x.id === elNode.dataset.id);
    if (e && !e.locked) return e;
  }
  return null;
}

// ─── 吸着（整列ガイド） ───────────────────────────────────

function snapTargets(pg, exclude) {
  const size = pageSize(state.project);
  const m = state.project.safeMargin;
  const xs = [0, size.w / 2, size.w, m, size.w - m];
  const ys = [0, size.h / 2, size.h, m, size.h - m];
  for (const e of pg.elements) {
    if (exclude.has(e.id) || e.hidden) continue;
    const b = boundingBox(e);
    xs.push(b.x1, (b.x1 + b.x2) / 2, b.x2);
    ys.push(b.y1, (b.y1 + b.y2) / 2, b.y2);
  }
  return { xs, ys };
}

function snapAxis(values, targets, tol) {
  let best = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, pos: t };
    }
  }
  return best;
}

// ─── ポインター操作 ───────────────────────────────────


function onPointerDown(ev) {
  if (ev.button !== 0) return;
  const wrap = ev.target.closest('.page-wrap');
  if (!wrap) return;
  const pageId = wrap.dataset.page;
  if (document.activeElement?.isContentEditable) return;
  const handle = ev.target.closest('.handle');
  const pt = pagePoint(wrap, ev);
  if (state.pageId !== pageId) {
    state.pageId = pageId;
    emit('page');
  }
  if (handle) {
    const id = handle.closest('.sel-box').dataset.id;
    startTransform(ev, wrap, id, handle.dataset.handle, pt);
    return;
  }
  // トリミング調整中
  if (state.cropMode) {
    const f = findElement(state.cropMode);
    const box = ev.target.closest('.sel-box');
    if (f && box?.dataset.id === state.cropMode) {
      startCrop(ev, wrap, f.element, pt);
      return;
    }
    state.cropMode = null;
  }
  const hit = topElementAt(ev, pageId);
  if (!hit) {
    if (!ev.shiftKey) select([]);
    startMarquee(ev, wrap, pt);
    return;
  }
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
    select([hit.id], { additive: true });
    return;
  }
  if (!state.selection.includes(hit.id)) select([hit.id]);
  startMove(ev, wrap, pt);
}

function capture(ev, onMove, onUp) {
  const target = ev.target;
  try { target.setPointerCapture(ev.pointerId); } catch { /* なし */ }
  const move = (e) => onMove(e);
  const up = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onUp(e);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function startMove(ev, wrap, start) {
  const pg = currentPage();
  const items = state.selection.map((id) => pg.elements.find((e) => e.id === id)).filter((e) => e && !e.locked);
  if (!items.length) return;
  const origin = items.map((e) => ({ e, x: e.x, y: e.y }));
  const exclude = new Set(items.map((e) => e.id));
  const targets = snapTargets(pg, exclude);
  let moved = false;
  capture(ev, (e) => {
    const p = pagePoint(wrap, e);
    let dx = p.x - start.x;
    let dy = p.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 0.8 / state.zoom) return;
    if (!moved) {
      checkpoint();
      moved = true;
    }
    const guides = [];
    if (!e.altKey) {
      // 選択範囲全体の外接矩形で吸着
      const bb = origin.reduce((a, o) => {
        const b = boundingBox({ ...o.e, x: o.x + dx, y: o.y + dy });
        return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
      }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
      const tol = SNAP_MM / Math.max(0.5, state.zoom);
      const sx = snapAxis([bb.x1, (bb.x1 + bb.x2) / 2, bb.x2], targets.xs, tol);
      const sy = snapAxis([bb.y1, (bb.y1 + bb.y2) / 2, bb.y2], targets.ys, tol);
      if (sx) { dx += sx.d; guides.push({ axis: 'v', pos: sx.pos }); }
      if (sy) { dy += sy.d; guides.push({ axis: 'h', pos: sy.pos }); }
    }
    for (const o of origin) {
      o.e.x = round(o.x + dx, 2);
      o.e.y = round(o.y + dy, 2);
      const node = view.doc?.elements.get(o.e.id);
      if (node) { node.style.left = `${o.e.x}mm`; node.style.top = `${o.e.y}mm`; }
    }
    renderOverlays();
    showGuides(pg.id, guides);
  }, () => {
    showGuides(pg.id, []);
    if (moved) mutateQuiet(() => {}, 'all');
  });
}

function startTransform(ev, wrap, id, handle, start) {
  const f = findElement(id);
  if (!f || f.element.locked) return;
  const e = f.element;
  const o = { x: e.x, y: e.y, w: e.w, h: e.h, r: e.rotation || 0 };
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const targets = snapTargets(f.page, new Set([id]));
  checkpoint();
  const keepRatioDefault = e.type === 'image' && e.role === 'design';
  capture(ev, (pe) => {
    const p = pagePoint(wrap, pe);
    const guides = [];
    if (handle === 'rot') {
      let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (pe.shiftKey) a = Math.round(a / 15) * 15;
      else for (const s of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - s) < 3) a = s;
      e.rotation = round(((a % 360) + 360) % 360, 1);
      if (e.rotation === 360) e.rotation = 0;
    } else {
      const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
      const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
      const rad = (o.r * Math.PI) / 180;
      const gdx = p.x - start.x;
      const gdy = p.y - start.y;
      // 回転を戻した座標で計算
      let ldx = gdx * Math.cos(rad) + gdy * Math.sin(rad);
      let ldy = -gdx * Math.sin(rad) + gdy * Math.cos(rad);
      if (!o.r && !pe.altKey) {
        const tol = SNAP_MM / Math.max(0.5, state.zoom);
        if (sx) {
          const edge = sx > 0 ? o.x + o.w + ldx : o.x + ldx;
          const s = snapAxis([edge], targets.xs, tol);
          if (s) { ldx += s.d; guides.push({ axis: 'v', pos: s.pos }); }
        }
        if (sy) {
          const edge = sy > 0 ? o.y + o.h + ldy : o.y + ldy;
          const s = snapAxis([edge], targets.ys, tol);
          if (s) { ldy += s.d; guides.push({ axis: 'h', pos: s.pos }); }
        }
      }
      let w = Math.max(2, o.w + sx * ldx);
      let h = Math.max(2, o.h + sy * ldy);
      const keep = sx && sy && (keepRatioDefault !== pe.shiftKey);
      if (keep) {
        const ratio = o.w / o.h;
        if (w / h > ratio) h = w / ratio;
        else w = h * ratio;
      }
      const dcxl = (sx * (w - o.w)) / 2;
      const dcyl = (sy * (h - o.h)) / 2;
      const ncx = cx + dcxl * Math.cos(rad) - dcyl * Math.sin(rad);
      const ncy = cy + dcxl * Math.sin(rad) + dcyl * Math.cos(rad);
      e.w = round(w, 2);
      e.h = round(h, 2);
      e.x = round(ncx - w / 2, 2);
      e.y = round(ncy - h / 2, 2);
    }
    const node = view.doc?.elements.get(id);
    if (node) {
      Object.assign(node.style, { left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${e.h}mm`, transform: e.rotation ? `rotate(${e.rotation}deg)` : '' });
      if (e.type === 'image') updateImageNode(node, e);
    }
    renderOverlays();
    showGuides(f.page.id, guides);
  }, () => {
    showGuides(f.page.id, []);
    mutateQuiet(() => {}, 'all');
  });
}

function updateImageNode(node, e) {
  const img = node.querySelector('.mp-image img');
  const assetId = e.binding ? state.project.dishes.find((d) => d.id === e.binding.dishId)?.photoAssetId : e.assetId;
  const info = assetInfo(assetId);
  if (!img || !info) return;
  const bw = e.borderWidth || 0;
  const L = imageLayout(e.w - bw * 2, e.h - bw * 2, info.width, info.height, e.fit, e.crop);
  Object.assign(img.style, { width: `${L.w}mm`, height: `${L.h}mm`, left: `${L.left}mm`, top: `${L.top}mm` });
}

function startCrop(ev, wrap, e, start) {
  const assetId = e.binding ? state.project.dishes.find((d) => d.id === e.binding.dishId)?.photoAssetId : e.assetId;
  const info = assetInfo(assetId);
  if (!info) return;
  const bw = e.borderWidth || 0;
  const L = imageLayout(e.w - bw * 2, e.h - bw * 2, info.width, info.height, e.fit, e.crop);
  const spareX = e.w - bw * 2 - L.w;
  const spareY = e.h - bw * 2 - L.h;
  const o = { ...e.crop };
  const rad = ((e.rotation || 0) * Math.PI) / 180;
  checkpoint();
  capture(ev, (pe) => {
    const p = pagePoint(wrap, pe);
    const gdx = p.x - start.x;
    const gdy = p.y - start.y;
    const dx = gdx * Math.cos(rad) + gdy * Math.sin(rad);
    const dy = -gdx * Math.sin(rad) + gdy * Math.cos(rad);
    e.crop = {
      ...e.crop,
      x: Math.abs(spareX) > 0.01 ? clamp(o.x + dx / spareX, 0, 1) : o.x,
      y: Math.abs(spareY) > 0.01 ? clamp(o.y + dy / spareY, 0, 1) : o.y,
    };
    const node = view.doc?.elements.get(e.id);
    if (node) updateImageNode(node, e);
  }, () => mutateQuiet(() => {}, 'all'));
}

function startMarquee(ev, wrap, start) {
  const ov = wrap.querySelector('.overlay');
  const pageId = wrap.dataset.page;
  const pg = state.project.pages.find((p) => p.id === pageId);
  const box = el('div', { class: 'marquee' });
  let active = false;
  capture(ev, (pe) => {
    const p = pagePoint(wrap, pe);
    if (!active && Math.hypot(p.x - start.x, p.y - start.y) < 1) return;
    if (!active) { ov.append(box); active = true; }
    const x1 = Math.min(start.x, p.x), y1 = Math.min(start.y, p.y);
    Object.assign(box.style, { left: `${x1}mm`, top: `${y1}mm`, width: `${Math.abs(p.x - start.x)}mm`, height: `${Math.abs(p.y - start.y)}mm` });
    box.dataset.rect = JSON.stringify([x1, y1, Math.max(start.x, p.x), Math.max(start.y, p.y)]);
  }, () => {
    if (!active) return;
    const [x1, y1, x2, y2] = JSON.parse(box.dataset.rect || '[0,0,0,0]');
    box.remove();
    const ids = pg.elements.filter((e) => {
      if (e.locked || e.hidden) return false;
      const b = boundingBox(e);
      return b.x1 >= x1 && b.y1 >= y1 && b.x2 <= x2 && b.y2 <= y2;
    }).map((e) => e.id);
    select(ids, { additive: ev.shiftKey });
  });
}

// ─── ダブルクリック：文字の直接編集・トリミング ───────────────

export let onEditDish = () => {};
export function setDishEditHandler(fn) { onEditDish = fn; }

function onDoubleClick(ev) {
  const wrap = ev.target.closest('.page-wrap');
  if (!wrap) return;
  const hit = topElementAt(ev, wrap.dataset.page);
  if (!hit) return;
  if (hit.type === 'text') {
    if (hit.binding) {
      onEditDish(hit.binding.dishId, hit.binding.field);
      return;
    }
    startInlineEdit(hit);
  } else if (hit.type === 'image') {
    enterCrop(hit.id);
  } else if (hit.type === 'menu') {
    const item = ev.target.closest('.mp-item');
    if (item) onEditDish(item.dataset.dish, 'name');
  }
}

export function enterCrop(id) {
  const f = findElement(id);
  if (!f || f.element.type !== 'image') return;
  select([id]);
  state.cropMode = id;
  renderOverlays();
  toast('写真をドラッグして表示位置を調整できます。拡大は右の「拡大」で。終わったら Enter か枠の外をクリック。');
}

export function exitCrop() {
  if (!state.cropMode) return;
  state.cropMode = null;
  renderOverlays();
}

function startInlineEdit(e) {
  const node = view.doc?.elements.get(e.id);
  const inner = node?.querySelector('.mp-text-inner');
  if (!inner) return;
  select([e.id]);
  stage.querySelector(`.sel-box[data-id="${e.id}"]`)?.classList.add('editing');
  node.classList.add('is-editing');
  inner.contentEditable = 'plaintext-only';
  if (inner.contentEditable !== 'plaintext-only') inner.contentEditable = 'true';
  inner.focus();
  const range = document.createRange();
  range.selectNodeContents(inner);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const finish = () => {
    inner.removeEventListener('blur', finish);
    inner.contentEditable = 'false';
    node.classList.remove('is-editing');
    const text = inner.innerText.replace(/\n$/, '');
    if (text !== e.text) update((p) => { const t = findIn(p, e.id); if (t) t.text = text; });
    else renderAll();
  };
  inner.addEventListener('blur', finish);
  inner.addEventListener('keydown', (k) => {
    if (k.key === 'Escape' || (k.key === 'Enter' && (k.metaKey || k.ctrlKey))) {
      k.preventDefault();
      inner.blur();
    }
    k.stopPropagation();
  });
}

function findIn(p, id) {
  for (const pg of p.pages) {
    const e = pg.elements.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

// ─── ドロップ（画像ファイル・素材・料理） ─────────────────────

function hasDropData(e) {
  const t = [...(e.dataTransfer?.types || [])];
  return t.includes('Files') || t.includes('application/x-menu-asset') || t.includes('application/x-menu-dish');
}

function markDropTarget(e) {
  stage.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  if (!e) return;
  const wrap = e.target.closest?.('.page-wrap');
  if (!wrap) return;
  const hit = topElementAt(e, wrap.dataset.page);
  if (hit?.type === 'image') view.doc?.elements.get(hit.id)?.classList.add('drop-target');
}

async function onDrop(ev) {
  ev.preventDefault();
  markDropTarget(null);
  const wrap = ev.target.closest('.page-wrap') || stage.querySelector(`.page-wrap[data-page="${state.pageId}"]`);
  if (!wrap) return;
  const pageId = wrap.dataset.page;
  const pt = pagePoint(wrap, ev);
  const hit = topElementAt(ev, pageId);
  const dishId = ev.dataTransfer.getData('application/x-menu-dish');
  if (dishId) {
    insertDishBlock(pageId, dishId, pt);
    return;
  }
  let assetId = ev.dataTransfer.getData('application/x-menu-asset');
  if (!assetId) {
    const files = [...ev.dataTransfer.files];
    if (files.some(isPdfFile)) {
      state.pageId = pageId;
      await importExistingMenu(files);
      return;
    }
    const images = files.filter(isImageFile);
    if (!images.length) {
      toast('JPEG・PNG・WebP の画像をドロップしてください。', 'error');
      return;
    }
    const kind = hit?.type === 'image' && hit.role === 'photo' ? 'photo' : 'design';
    const added = await addImageFiles(images, kind);
    if (!added.length) return;
    update((p) => { p.libraryAssetIds = [...new Set([...(p.libraryAssetIds || []), ...added.map((a) => a.id)])]; }, { render: 'assets' });
    assetId = added[0].id;
  }
  placeAsset(pageId, assetId, pt, hit);
}

// 画像を置く。写真枠の上なら差し替え（枠の位置と大きさはそのまま）
export function placeAsset(pageId, assetId, pt, target = null) {
  const info = assetInfo(assetId);
  if (!info) return;
  if (target?.type === 'image') {
    update((p) => {
      const t = findIn(p, target.id);
      if (t.binding?.field === 'photo') {
        const d = p.dishes.find((x) => x.id === t.binding.dishId);
        if (d) { d.photoAssetId = assetId; d.showPhoto = true; }
      } else {
        t.assetId = assetId;
      }
      t.crop = { x: 0.5, y: 0.5, zoom: 1 };
    });
    toast(target.binding ? '料理の写真を差し替えました（枠はそのまま）' : '画像を差し替えました（枠はそのまま）', 'success');
    return;
  }
  const size = pageSize(state.project);
  const maxSide = Math.min(70, size.w * 0.4);
  const r = info.width / info.height;
  const w = r >= 1 ? maxSide : maxSide * r;
  const h = r >= 1 ? maxSide / r : maxSide;
  const center = pt || { x: size.w / 2, y: size.h / 2 };
  const node = info.kind === 'photo'
    ? newPhotoFrame({ assetId, w, h, x: round(center.x - w / 2), y: round(center.y - h / 2) })
    : newImage({ assetId, w, h, x: round(center.x - w / 2), y: round(center.y - h / 2), name: info.name.replace(/\.[a-z]+$/i, '') });
  update((p) => {
    p.pages.find((x) => x.id === pageId).elements.push(node);
  });
  state.pageId = pageId;
  select([node.id]);
}

// 料理をページにドロップ → 料理名・説明・価格の文字を紐付けて配置
export function insertDishBlock(pageId, dishId, pt) {
  const dish = state.project.dishes.find((d) => d.id === dishId);
  if (!dish) return;
  const x = round(pt.x - 35);
  const y = round(pt.y - 6);
  const name = newText({ text: '', binding: { dishId, field: 'name' }, x, y, w: 50, h: 7, style: textStyle({ size: 11 }) });
  const price = newText({ text: '', binding: { dishId, field: 'price' }, x: x + 50, y, w: 20, h: 7, style: textStyle({ size: 11, align: 'right' }) });
  const desc = newText({ text: '', binding: { dishId, field: 'description' }, x, y: y + 7, w: 70, h: 6, style: textStyle({ size: 8.5, color: '#5a5650' }) });
  update((p) => { p.pages.find((pg) => pg.id === pageId).elements.push(name, price, desc); });
  select([name.id, price.id, desc.id]);
  toast(`「${dish.name}」を配置しました。料理情報を変えると自動で反映されます。`, 'success');
}
