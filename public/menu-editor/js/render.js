// メニューの描画。編集画面と印刷で同じ関数を使い、ずれを小さくする。

import { el, formatPrice, round } from './util.js';
import { assetURL, assetInfo } from './db.js';
import { fontCSS, pageSize, categoryName } from './model.js';

export const LOW_DPI = 150; // これ未満は注意
export const VERY_LOW_DPI = 96;

export function applyTextStyle(node, s) {
  node.style.fontFamily = fontCSS(s.font);
  node.style.fontSize = `${s.size}pt`;
  node.style.color = s.color;
  node.style.lineHeight = String(s.lineHeight);
  node.style.textAlign = s.align;
  node.style.fontWeight = s.bold ? '700' : '400';
  node.style.fontStyle = s.italic ? 'italic' : 'normal';
  node.style.letterSpacing = s.letterSpacing ? `${s.letterSpacing}em` : '';
}

export function dishFieldValue(project, dish, field) {
  if (!dish) return '';
  switch (field) {
    case 'name': return dish.name;
    case 'description': return dish.description;
    case 'price': return formatPrice(dish.price, project.priceFormat);
    case 'badges': return (dish.badges || []).join('・');
    case 'category': return categoryName(project, dish.categoryId);
    default: return '';
  }
}

// 画像を枠に収める計算（mm）。fit: cover=枠いっぱいに切り抜く / contain=全体を収める
export function imageLayout(frameW, frameH, imgW, imgH, fit, crop = { x: 0.5, y: 0.5, zoom: 1 }) {
  const r = imgW / imgH;
  let w, h;
  if (fit === 'cover' ? frameW / frameH > r : frameW / frameH < r) {
    w = frameW;
    h = frameW / r;
  } else {
    h = frameH;
    w = frameH * r;
  }
  const z = crop.zoom || 1;
  w *= z;
  h *= z;
  return { w, h, left: (frameW - w) * crop.x, top: (frameH - h) * crop.y };
}

export function effectiveDpi(asset, displayWmm) {
  if (!asset || !displayWmm) return Infinity;
  return asset.width / (displayWmm / 25.4);
}

function resolveImage(project, e) {
  if (e.binding?.field === 'photo') {
    const dish = project.dishes.find((d) => d.id === e.binding.dishId);
    if (!dish) return { assetId: null, missingDish: true };
    return { assetId: dish.showPhoto === false ? null : dish.photoAssetId, dish, hiddenByDish: dish.showPhoto === false };
  }
  return { assetId: e.assetId };
}

function renderImage(project, e, mode, issues, pageId) {
  const box = el('div', { class: 'mp-image' });
  box.style.borderRadius = e.shape === 'circle' ? '50%' : e.shape === 'rounded' ? `${e.radius}mm` : '0';
  if (e.borderWidth) box.style.border = `${e.borderWidth}mm solid ${e.borderColor}`;
  const { assetId, missingDish, hiddenByDish, dish } = resolveImage(project, e);
  const info = assetInfo(assetId);
  if (assetId && info) {
    const bw = e.borderWidth || 0;
    const fw = Math.max(1, e.w - bw * 2);
    const fh = Math.max(1, e.h - bw * 2);
    const L = imageLayout(fw, fh, info.width, info.height, e.fit, e.crop);
    const img = el('img', { src: assetURL(assetId), alt: '', draggable: 'false', decoding: 'sync' });
    Object.assign(img.style, { width: `${L.w}mm`, height: `${L.h}mm`, left: `${L.left}mm`, top: `${L.top}mm` });
    box.append(img);
    const dpi = effectiveDpi(info, L.w);
    if (dpi < LOW_DPI) {
      issues.push({
        level: 'warn', pageId, elId: e.id, kind: 'dpi',
        message: `画像の解像度が不足しています（約${Math.round(dpi)}dpi）。印刷するとぼやける可能性があります。${Math.ceil((LOW_DPI * L.w) / 25.4)}px 以上の幅の画像がおすすめです。`,
      });
      if (mode === 'edit') box.classList.add(dpi < VERY_LOW_DPI ? 'is-lowres-strong' : 'is-lowres');
    }
  } else {
    box.classList.add('is-empty');
    if (mode === 'edit') {
      const label = missingDish
        ? '紐付けた料理が見つかりません'
        : hiddenByDish
          ? `「${dish.name}」は写真を非表示にしています`
          : dish
            ? `「${dish.name}」の写真がありません`
            : e.role === 'photo' ? '写真をドロップ' : '画像をドロップ';
      box.append(el('span', { class: 'mp-placeholder' }, label));
    }
    if (missingDish) issues.push({ level: 'warn', pageId, elId: e.id, message: '写真枠に紐付けた料理が削除されています。' });
    else if (!hiddenByDish && e.role === 'photo') issues.push({ level: 'info', pageId, elId: e.id, kind: 'empty', message: '写真が入っていない写真枠があります（印刷では空白になります）。' });
  }
  return box;
}

function renderText(project, e, mode, issues, pageId) {
  const box = el('div', { class: 'mp-text' });
  const s = e.style;
  applyTextStyle(box, s);
  if (e.fill) box.style.background = e.fill;
  box.style.justifyContent = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[s.valign] || 'flex-start';
  if (s.vertical) box.classList.add('is-vertical');
  let text = e.text;
  if (e.binding) {
    const dish = project.dishes.find((d) => d.id === e.binding.dishId);
    if (!dish) {
      text = mode === 'edit' ? '（紐付けた料理が見つかりません）' : '';
      issues.push({ level: 'warn', pageId, elId: e.id, message: '文字に紐付けた料理が削除されています。' });
    } else {
      text = dishFieldValue(project, dish, e.binding.field);
    }
  }
  box.append(el('div', { class: 'mp-text-inner' }, text));
  return box;
}

function renderShape(e) {
  const box = el('div', { class: `mp-shape mp-shape-${e.shape}` });
  if (e.shape === 'line') {
    const line = el('div', { class: 'mp-line' });
    line.style.borderTop = `${Math.max(0.1, e.strokeWidth)}mm ${e.strokeStyle} ${e.stroke}`;
    box.append(line);
  } else {
    box.style.background = e.fill || 'transparent';
    if (e.strokeWidth) box.style.border = `${e.strokeWidth}mm ${e.strokeStyle} ${e.stroke}`;
    box.style.borderRadius = e.shape === 'ellipse' ? '50%' : `${e.radius}mm`;
  }
  return box;
}

export function menuDishes(project, e) {
  const order = new Map(project.categories.map((c, i) => [c.id, i]));
  const ex = new Set(e.excludeDishIds || []);
  let list = project.dishes.filter((d) => !ex.has(d.id));
  if (e.categoryIds?.length) {
    const ids = new Set(e.categoryIds);
    list = list.filter((d) => ids.has(d.categoryId));
  }
  // カテゴリー順 → 登録順
  return list
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (order.get(a.d.categoryId) ?? 1e9) - (order.get(b.d.categoryId) ?? 1e9) || a.i - b.i)
    .map((x) => x.d);
}

function renderMenuItems(project, e, dishes) {
  const L = e.layout;
  const S = e.styles;
  const frag = document.createDocumentFragment();
  let prevCat = Symbol('none');
  for (const d of dishes) {
    if (L.showCategory && d.categoryId !== prevCat) {
      const h = el('div', { class: 'mp-cat', dataset: { cat: d.categoryId || '' } }, categoryName(project, d.categoryId));
      applyTextStyle(h, S.category);
      h.style.paddingBottom = `${L.itemGap * 0.6}mm`;
      h.style.paddingTop = `${L.categoryGap}mm`;
      frag.append(h);
    }
    prevCat = d.categoryId;
    const item = el('div', { class: 'mp-item', dataset: { dish: d.id } });
    item.style.paddingBottom = `${L.itemGap}mm`;
    if (L.showPhotos && d.showPhoto !== false && d.photoAssetId && assetInfo(d.photoAssetId)) {
      const ph = el('div', { class: 'mp-item-photo' }, el('img', { src: assetURL(d.photoAssetId), alt: '', draggable: 'false' }));
      Object.assign(ph.style, {
        width: `${L.photoSize}mm`,
        height: `${L.photoSize}mm`,
        borderRadius: L.photoShape === 'circle' ? '50%' : L.photoShape === 'rounded' ? '2mm' : '0',
      });
      item.append(ph);
    }
    const name = el('span', { class: 'mp-name' }, d.name);
    applyTextStyle(name, { ...S.name, align: 'left' });
    for (const b of d.badges || []) {
      const badge = el('span', { class: 'mp-badge' }, b);
      badge.style.color = S.badgeColor;
      badge.style.borderColor = S.badgeColor;
      name.append(' ', badge);
    }
    const head = el('div', { class: 'mp-item-head' }, name);
    const priceText = formatPrice(d.price, project.priceFormat);
    if (priceText) {
      if (L.leader) head.append(el('span', { class: 'mp-leader' }));
      else head.append(el('span', { class: 'mp-spacer' }));
      const price = el('span', { class: 'mp-price' }, priceText);
      applyTextStyle(price, S.price);
      head.append(price);
    }
    const body = el('div', { class: 'mp-item-body' }, head);
    if (L.showDescription && d.description) {
      const desc = el('div', { class: 'mp-desc' }, d.description);
      applyTextStyle(desc, S.desc);
      body.append(desc);
    }
    item.append(body);
    frag.append(item);
  }
  return frag;
}

function renderMenuShell(e) {
  const box = el('div', { class: 'mp-menu' });
  box.style.columnCount = String(e.layout.columns);
  box.style.columnGap = `${e.layout.columnGap}mm`;
  return box;
}

function elementNode(project, e, mode, issues, pageId) {
  const node = el('div', { class: `mp-el mp-el-${e.type}`, dataset: { id: e.id } });
  Object.assign(node.style, {
    left: `${e.x}mm`,
    top: `${e.y}mm`,
    width: `${e.w}mm`,
    height: `${e.h}mm`,
    opacity: String(e.opacity),
    transform: e.rotation ? `rotate(${e.rotation}deg)` : '',
  });
  if (e.type === 'text') node.append(renderText(project, e, mode, issues, pageId));
  else if (e.type === 'image') node.append(renderImage(project, e, mode, issues, pageId));
  else if (e.type === 'shape') node.append(renderShape(e));
  else if (e.type === 'menu') node.append(renderMenuShell(e));
  return node;
}

// 回転を考慮した外接矩形
export function boundingBox(e) {
  if (!e.rotation) return { x1: e.x, y1: e.y, x2: e.x + e.w, y2: e.y + e.h };
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const a = (e.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (e.w * c + e.h * s) / 2;
  const hh = (e.w * s + e.h * c) / 2;
  return { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh };
}

/**
 * ページを描画する。
 * mode: 'edit'（下敷き・空の写真枠の案内を表示）/ 'print'
 * 戻り値: { pages: Map(pageId → node), elements: Map(elId → node), issues, flow() }
 * flow() は文字のはみ出しと料理リストの流し込みを計算する（DOM に追加した後に呼ぶ）。
 */
export function renderDocument(project, container, mode = 'edit') {
  const size = pageSize(project);
  const issues = [];
  const pages = new Map();
  const elements = new Map();
  container.replaceChildren();
  project.pages.forEach((pg, index) => {
    const page = el('div', { class: 'mp-page', dataset: { page: pg.id, index: String(index + 1) } });
    Object.assign(page.style, { width: `${size.w}mm`, height: `${size.h}mm`, background: pg.background.color || '#fff' });
    if (pg.background.assetId && assetInfo(pg.background.assetId)) {
      const bg = el('img', { class: 'mp-bg', src: assetURL(pg.background.assetId), alt: '', draggable: 'false' });
      bg.style.objectFit = pg.background.fit;
      bg.style.opacity = String(pg.background.opacity ?? 1);
      page.append(bg);
    }
    const underlay = mode === 'edit' && pg.underlay.assetId && pg.underlay.visible && assetInfo(pg.underlay.assetId)
      ? el('img', { class: `mp-underlay${pg.underlay.onTop ? ' on-top' : ''}`, src: assetURL(pg.underlay.assetId), alt: '', draggable: 'false', style: { opacity: String(pg.underlay.opacity), objectFit: pg.underlay.fit || 'contain' } })
      : null;
    if (underlay && !pg.underlay.onTop) page.append(underlay);
    for (const e of pg.elements) {
      if (e.hidden) continue;
      const node = elementNode(project, e, mode, issues, pg.id);
      elements.set(e.id, node);
      page.append(node);
      const bb = boundingBox(e);
      const m = project.safeMargin;
      if (bb.x2 <= 0 || bb.y2 <= 0 || bb.x1 >= size.w || bb.y1 >= size.h) {
        issues.push({ level: 'error', pageId: pg.id, elId: e.id, message: '用紙の外に置かれていて印刷されません。' });
      } else if (e.type === 'text' || e.type === 'menu') {
        const tol = 0.3;
        if (bb.x1 < -tol || bb.y1 < -tol || bb.x2 > size.w + tol || bb.y2 > size.h + tol) {
          issues.push({ level: 'error', pageId: pg.id, elId: e.id, message: '文字が用紙の端からはみ出しています（印刷で欠けます）。' });
        } else if (bb.x1 < m - tol || bb.y1 < m - tol || bb.x2 > size.w - m + tol || bb.y2 > size.h - m + tol) {
          issues.push({ level: 'warn', pageId: pg.id, elId: e.id, kind: 'margin', message: `文字が印刷範囲（端から${m}mm）にかかっています。プリンターによっては欠けることがあります。` });
        }
      }
    }
    if (underlay && pg.underlay.onTop) page.append(underlay);
    pages.set(pg.id, page);
    container.append(page);
  });

  const flow = () => flowDocument(project, elements, issues, mode);
  return { pages, elements, issues, flow };
}

function flowDocument(project, elements, issues, mode) {
  // 前回の計算結果を消してから計算し直す
  for (let i = issues.length - 1; i >= 0; i--) if (issues[i].flow) issues.splice(i, 1);
  const pageOf = new Map();
  const menus = [];
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      pageOf.set(e.id, pg.id);
      if (e.type === 'menu' && !e.hidden && elements.has(e.id)) menus.push(e);
    }
  }
  const byId = new Map(menus.map((m) => [m.id, m]));
  const next = new Map();
  for (const m of menus) if (m.continueFrom && byId.has(m.continueFrom)) next.set(m.continueFrom, m);
  const roots = menus.filter((m) => !m.continueFrom || !byId.has(m.continueFrom));
  const result = new Map(); // menuId → { shown, overflow }
  const seen = new Set();
  for (const root of roots) {
    let m = root;
    let dishes = menuDishes(project, root);
    while (m && !seen.has(m.id)) {
      seen.add(m.id);
      const node = elements.get(m.id);
      const shell = node.querySelector('.mp-menu');
      const own = dishes;
      shell.replaceChildren(renderMenuItems(project, m, own));
      const shownCount = fitMenu(shell);
      const rest = own.slice(shownCount);
      result.set(m.id, { shown: shownCount, overflow: rest.length });
      const succ = next.get(m.id);
      node.classList.toggle('is-overflow', rest.length > 0 && !succ);
      if (rest.length && !succ) {
        issues.push({
          level: 'error', pageId: pageOf.get(m.id), elId: m.id, kind: 'menu-overflow', flow: true, count: rest.length,
          message: `料理リストに${rest.length}品が収まっていません（${rest.slice(0, 3).map((d) => d.name).join('、')}${rest.length > 3 ? ' など' : ''}）。枠を広げるか、「次のページへ続ける」を使ってください。`,
        });
      }
      if (!rest.length && m === root && mode === 'edit' && own.length === 0) {
        shell.append(el('div', { class: 'mp-placeholder' }, '表示する料理がありません'));
      }
      dishes = rest;
      m = succ;
    }
  }
  // 文字のはみ出し
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.type !== 'text' || e.hidden) continue;
      const node = elements.get(e.id);
      const box = node?.querySelector('.mp-text');
      if (!box) continue;
      const over = e.style.vertical ? box.scrollWidth > box.clientWidth + 1 : box.scrollHeight > box.clientHeight + 1;
      node.classList.toggle('is-overflow', over);
      if (over) issues.push({ level: 'error', pageId: pg.id, elId: e.id, flow: true, message: '文字が枠からはみ出しています。枠を広げるか、文章を短くしてください（文字は自動で小さくしません）。' });
    }
  }
  return result;
}

// 枠に収まる料理の数を返し、収まらない部分を取り除く
function fitMenu(shell) {
  const W = shell.clientWidth;
  const H = shell.clientHeight;
  const kids = [...shell.children];
  let cut = -1;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const out = k.offsetLeft + k.offsetWidth > W + 1 || k.offsetTop + k.offsetHeight > H + 1;
    if (out) {
      cut = i;
      break;
    }
  }
  if (cut === -1) return kids.filter((k) => k.classList.contains('mp-item')).length;
  // 見出しだけが残らないようにする
  while (cut > 0 && kids[cut - 1].classList.contains('mp-cat')) cut--;
  for (let i = cut; i < kids.length; i++) kids[i].remove();
  return kids.slice(0, cut).filter((k) => k.classList.contains('mp-item')).length;
}

export function issueSummary(issues) {
  const c = { error: 0, warn: 0, info: 0 };
  for (const i of issues) c[i.level]++;
  return c;
}

export { round };
