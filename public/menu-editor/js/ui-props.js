// 右パネル「選択した要素の設定」

import { el, pickFiles, toast } from './util.js';
import { assetURL, assetInfo } from './db.js';
import { FONTS, DISH_FIELDS, elementLabel } from './model.js';
import { addImageFile, IMAGE_ACCEPT } from './assets.js';
import { effectiveDpi, imageLayout, LOW_DPI } from './render.js';
import { state, update, subscribe, selectedElements, currentPage, findElement } from './store.js';
import { view, enterCrop, exitCrop, scrollToElement } from './canvas.js';
import { focusDish } from './ui-dishes.js';
import {
  section, row, numField, rangeField, textField, colorField, selectField, checkField, segmented, buttons,
} from './fields.js';
import {
  deleteSelected, duplicateSelected, reorder, align, distribute, continueOnNextPage, setImageAsBackground, fitFrameToImage,
} from './ops.js';
import { importExistingMenu } from './importer.js';

let root;
let issuesRoot;

export function initProps(container, issuesContainer) {
  root = container;
  issuesRoot = issuesContainer;
  subscribe((what) => {
    if (['all', 'selection', 'page'].includes(what)) render();
    if (['all', 'issues', 'selection', 'page'].includes(what)) renderIssues();
  });
}

// 選択中の要素を変更する。live=true は入力中（パネルは描き直さない）
function setEl(id, fn, field) {
  update((p) => {
    for (const pg of p.pages) {
      const e = pg.elements.find((x) => x.id === id);
      if (e) fn(e, pg, p);
    }
  }, field ? { key: `el:${id}:${field}`, render: 'canvas' } : {});
}

const setPage = (fn, field) =>
  update((p) => fn(p.pages.find((x) => x.id === state.pageId), p), field ? { key: `page:${field}`, render: 'canvas' } : {});

function textStyleSection(title, style, apply, { withAlign = true, withValign = false, withVertical = false } = {}) {
  const set = (k, live) => (v) => apply((s) => { s[k] = v; }, live ? k : null);
  return section(title,
    selectField('フォント', style.font, FONTS.map((f) => ({ value: f.key, label: f.label })), set('font')),
    row(
      numField('大きさ', style.size, set('size', true), { step: 0.5, min: 4, max: 200, unit: 'pt' }),
      numField('行間', style.lineHeight, set('lineHeight', true), { step: 0.1, min: 0.8, max: 4, unit: '倍' }),
    ),
    row(
      colorField('色', style.color, set('color', true)),
      numField('字間', style.letterSpacing, set('letterSpacing', true), { step: 0.05, min: -0.2, max: 2, unit: 'em' }),
    ),
    withAlign ? segmented(style.align, [{ value: 'left', label: '左' }, { value: 'center', label: '中央' }, { value: 'right', label: '右' }, { value: 'justify', label: '均等' }], set('align'), { label: '横の配置' }) : null,
    withValign ? segmented(style.valign, [{ value: 'top', label: '上' }, { value: 'middle', label: '中央' }, { value: 'bottom', label: '下' }], set('valign'), { label: '縦の配置' }) : null,
    row(
      checkField('太字', style.bold, set('bold')),
      checkField('斜体', style.italic, set('italic')),
      withVertical ? checkField('縦書き', style.vertical, set('vertical')) : null,
    ),
  );
}

function commonSection(e) {
  const live = (k) => (v) => setEl(e.id, (x) => { x[k] = v; }, k);
  return section('位置と大きさ',
    row(numField('横位置', e.x, live('x'), { unit: 'mm' }), numField('縦位置', e.y, live('y'), { unit: 'mm' })),
    row(numField('幅', e.w, live('w'), { unit: 'mm', min: 1 }), numField('高さ', e.h, live('h'), { unit: 'mm', min: 1 })),
    row(numField('回転', e.rotation, live('rotation'), { step: 1, unit: '°' }), rangeField('透明度', e.opacity, live('opacity'), { format: (v) => `${Math.round(v * 100)}%` })),
    el('div', { class: 'field' }, el('span', {}, 'ページに合わせて整列'),
      buttons(
        { label: '左', onClick: () => align('left') }, { label: '左右中央', onClick: () => align('center') }, { label: '右', onClick: () => align('right') },
        { label: '上', onClick: () => align('top') }, { label: '上下中央', onClick: () => align('middle') }, { label: '下', onClick: () => align('bottom') },
      )),
    el('div', { class: 'field' }, el('span', {}, '重なり順'),
      buttons(
        { label: '最前面', onClick: () => reorder('front') }, { label: '前へ', onClick: () => reorder('forward') },
        { label: '後ろへ', onClick: () => reorder('backward') }, { label: '最背面', onClick: () => reorder('back') },
      )),
    row(
      checkField('ロック（誤操作を防ぐ）', e.locked, (v) => setEl(e.id, (x) => { x.locked = v; })),
      checkField('隠す', e.hidden, (v) => setEl(e.id, (x) => { x.hidden = v; })),
    ),
    textField('名前（レイヤー一覧用）', e.name, live('name'), { placeholder: elementLabel({ ...e, name: '' }) }),
    buttons({ label: '複製', onClick: () => duplicateSelected() }, { label: '削除', danger: true, onClick: () => deleteSelected(), disabled: e.locked }),
  );
}

function bindingSection(e, fields) {
  const p = state.project;
  const b = e.binding;
  const dishSel = selectField('料理', b?.dishId || '', [{ value: '', label: '（紐付けない）' }, ...p.dishes.map((d) => ({ value: d.id, label: d.name || '（名前なし）' }))], (v) =>
    setEl(e.id, (x) => {
      if (!v) {
        // 紐付けを外すときは、今の表示内容を文字として残す
        if (x.type === 'text' && x.binding) x.text = view.doc?.elements.get(x.id)?.innerText || x.text;
        if (x.type === 'image' && x.binding) x.assetId = p.dishes.find((d) => d.id === x.binding.dishId)?.photoAssetId || x.assetId;
        x.binding = null;
      } else {
        x.binding = { dishId: v, field: x.binding?.field || fields[0].key };
        if (x.type === 'image') x.role = 'photo';
      }
    }));
  const fieldSel = b && fields.length > 1 ? selectField('表示する項目', b.field, fields.map((f) => ({ value: f.key, label: f.label })), (v) => setEl(e.id, (x) => { x.binding.field = v; })) : null;
  return section('料理情報との紐付け',
    el('p', { class: 'hint' }, e.type === 'text'
      ? '料理を選ぶと、料理名・説明・価格などが自動で表示されます。料理情報を変更するとここにも反映されます。'
      : '料理を選ぶと、その料理の写真が入ります。料理の写真を差し替えても枠の位置と大きさはそのままです。'),
    dishSel, fieldSel,
    b ? buttons({ label: 'この料理を編集', onClick: () => focusDish(b.dishId, b.field) }) : null,
  );
}

function textProps(e) {
  const out = [];
  if (!e.binding) {
    out.push(section('文字', textField('内容', e.text, (v) => setEl(e.id, (x) => { x.text = v; }, 'text'), { multiline: true, rows: 3, hint: 'ページ上でダブルクリックしても編集できます。' })));
  }
  out.push(bindingSection(e, DISH_FIELDS));
  out.push(textStyleSection('文字の書式', e.style, (fn, live) => setEl(e.id, (x) => fn(x.style), live), { withValign: true, withVertical: true }));
  out.push(section('背景', colorField('塗り', e.fill, (v) => setEl(e.id, (x) => { x.fill = v; }, 'fill'), { allowNone: true })));
  return out;
}

function imageProps(e) {
  const p = state.project;
  const dish = e.binding ? p.dishes.find((d) => d.id === e.binding.dishId) : null;
  const assetId = e.binding ? dish?.photoAssetId : e.assetId;
  const info = assetInfo(assetId);
  const replace = async () => {
    const [f] = await pickFiles({ accept: IMAGE_ACCEPT });
    if (!f) return;
    try {
      const a = await addImageFile(f, e.role === 'photo' ? 'photo' : 'design');
      update((q) => {
        q.libraryAssetIds = [...new Set([...(q.libraryAssetIds || []), a.id])];
        const d = e.binding ? q.dishes.find((x) => x.id === e.binding.dishId) : null;
        if (d) { d.photoAssetId = a.id; d.showPhoto = true; }
        for (const pg of q.pages) {
          const x = pg.elements.find((y) => y.id === e.id);
          if (!x) continue;
          if (!d) x.assetId = a.id;
          x.crop = { x: 0.5, y: 0.5, zoom: 1 };
        }
      });
      toast('画像を差し替えました（枠の位置と大きさはそのまま）', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  let dpiNote = null;
  if (info) {
    const L = imageLayout(e.w, e.h, info.width, info.height, e.fit, e.crop);
    const dpi = Math.round(effectiveDpi(info, L.w));
    dpiNote = el('p', { class: dpi < LOW_DPI ? 'warn-text' : 'hint' }, `${info.width}×${info.height}px ・ 印刷時 約${dpi}dpi${dpi < LOW_DPI ? '（解像度が不足しています。もっと大きな画像がおすすめです）' : ''}`);
  }
  return [
    section('画像',
      segmented(e.role, [{ value: 'photo', label: '料理写真の枠' }, { value: 'design', label: 'デザイン素材' }], (v) => setEl(e.id, (x) => { x.role = v; if (v === 'design') x.binding = null; })),
      el('div', { class: 'img-preview' }, info ? el('img', { src: assetURL(assetId), alt: '' }) : el('span', { class: 'muted' }, '画像が入っていません')),
      dpiNote,
      buttons(
        { label: info ? '画像を差し替え' : '画像を選ぶ', primary: true, onClick: replace },
        e.role === 'design' && info ? { label: '背景に設定', onClick: () => setImageAsBackground(e.id), title: 'この画像をページの背景にしてロックします' } : null,
        e.role === 'design' && info ? { label: '枠を画像の縦横比に', onClick: () => fitFrameToImage(e.id) } : null,
      ),
      el('p', { class: 'hint' }, '素材一覧の画像をこの枠にドラッグしても差し替えられます。'),
    ),
    e.role === 'photo' ? bindingSection(e, [{ key: 'photo', label: '料理写真' }]) : null,
    section('枠と切り抜き',
      segmented(e.fit, [{ value: 'cover', label: '枠いっぱいに切り抜く' }, { value: 'contain', label: '画像全体を収める' }], (v) => setEl(e.id, (x) => { x.fit = v; x.crop = { x: 0.5, y: 0.5, zoom: 1 }; })),
      segmented(e.shape, [{ value: 'rect', label: '四角' }, { value: 'rounded', label: '角丸' }, { value: 'circle', label: '丸' }], (v) => setEl(e.id, (x) => { x.shape = v; }), { label: '枠の形' }),
      e.shape === 'rounded' ? numField('角の丸み', e.radius, (v) => setEl(e.id, (x) => { x.radius = v; }, 'radius'), { unit: 'mm', min: 0 }) : null,
      rangeField('拡大（トリミング）', e.crop.zoom, (v) => setEl(e.id, (x) => { x.crop = { ...x.crop, zoom: v }; }, 'zoom'), { min: 1, max: 4, step: 0.05, format: (v) => `${Math.round(v * 100)}%` }),
      buttons(
        state.cropMode === e.id ? { label: '位置の調整を終わる', primary: true, onClick: () => { exitCrop(); render(); } } : { label: '表示位置を調整', onClick: () => { enterCrop(e.id); render(); }, disabled: !info },
        { label: '中央に戻す', onClick: () => setEl(e.id, (x) => { x.crop = { x: 0.5, y: 0.5, zoom: 1 }; }) },
      ),
      row(
        numField('枠線', e.borderWidth, (v) => setEl(e.id, (x) => { x.borderWidth = Math.max(0, v); }, 'bw'), { step: 0.1, min: 0, unit: 'mm' }),
        colorField('枠線の色', e.borderColor, (v) => setEl(e.id, (x) => { x.borderColor = v; }, 'bc')),
      ),
    ),
  ];
}

function shapeProps(e) {
  const live = (k) => (v) => setEl(e.id, (x) => { x[k] = v; }, k);
  const isLine = e.shape === 'line';
  return [
    section('図形',
      segmented(e.shape, [{ value: 'rect', label: '四角' }, { value: 'ellipse', label: '円' }, { value: 'line', label: '線' }], (v) => setEl(e.id, (x) => { x.shape = v; if (v === 'line' && !x.strokeWidth) x.strokeWidth = 0.3; })),
      isLine ? null : colorField('塗り', e.fill, live('fill'), { allowNone: true }),
      row(
        numField(isLine ? '線の太さ' : '枠線の太さ', e.strokeWidth, (v) => setEl(e.id, (x) => { x.strokeWidth = Math.max(0, v); }, 'sw'), { step: 0.1, min: 0, unit: 'mm' }),
        colorField('線の色', e.stroke, live('stroke')),
      ),
      selectField('線の種類', e.strokeStyle, [{ value: 'solid', label: '実線' }, { value: 'dashed', label: '破線' }, { value: 'dotted', label: '点線' }, { value: 'double', label: '二重線' }], (v) => setEl(e.id, (x) => { x.strokeStyle = v; })),
      e.shape === 'rect' ? numField('角の丸み', e.radius, live('radius'), { unit: 'mm', min: 0 }) : null,
      isLine ? null : el('p', { class: 'hint' }, '取り込んだメニューの元の文字を隠すときは、四角の「塗り」を背景と同じ色にします（スポイトで色を拾えます）。柄や写真の上は単色では自然に隠せないため、下敷きにして作り直す方法がおすすめです。'),
    ),
  ];
}

function menuProps(e) {
  const p = state.project;
  const L = e.layout;
  const setL = (k, live) => (v) => setEl(e.id, (x) => { x.layout[k] = v; }, live ? `l-${k}` : null);
  const setS = (part) => (fn, live) => setEl(e.id, (x) => fn(x.styles[part]), live ? `s-${part}-${live}` : null);
  const src = e.continueFrom ? findElement(e.continueFrom) : null;
  const succ = p.pages.flatMap((pg) => pg.elements).find((x) => x.continueFrom === e.id);
  const overflow = view.issues.find((i) => i.elId === e.id && i.kind === 'menu-overflow');
  const flowBox = section('収まらないとき',
    overflow ? el('p', { class: 'warn-text' }, `${overflow.count}品が収まっていません。`) : el('p', { class: 'hint' }, 'すべての料理が収まっています。'),
    src ? el('p', { class: 'hint' }, `この料理リストは、${p.pages.indexOf(src.page) + 1}ページ目のリストの続きです。`) : null,
    succ ? el('p', { class: 'hint' }, '収まらない料理は、続きのリストに表示されます。') : null,
    buttons(
      !succ ? { label: '次のページへ続ける', primary: !!overflow, onClick: () => continueOnNextPage(e.id), title: '収まらない料理を次のページの続きのリストに表示します' } : { label: '続きのリストを選ぶ', onClick: () => scrollToElement(succ.id) },
      src ? { label: '前のリストを選ぶ', onClick: () => scrollToElement(src.element.id) } : null,
      src ? { label: '続きにするのをやめる', onClick: () => setEl(e.id, (x) => { x.continueFrom = null; }) } : null,
    ),
    el('p', { class: 'hint' }, '文字は自動で小さくしません。枠を広げる・文字を小さくする・次のページへ続ける、のどれかで調整してください。'),
  );
  const catBox = src ? null : section('表示するカテゴリー',
    el('div', { class: 'badge-checks' },
      p.categories.map((c) => checkField(c.name, !e.categoryIds.length || e.categoryIds.includes(c.id), (on) => setEl(e.id, (x) => {
        let ids = x.categoryIds.length ? [...x.categoryIds] : p.categories.map((y) => y.id);
        ids = on ? [...new Set([...ids, c.id])] : ids.filter((y) => y !== c.id);
        x.categoryIds = ids.length === p.categories.length ? [] : ids;
      })))),
    (e.excludeDishIds || []).length ? el('p', { class: 'hint' }, `${e.excludeDishIds.length}品をこのリストに表示しない設定です。`,
      el('button', { class: 'btn tiny', onclick: () => setEl(e.id, (x) => { x.excludeDishIds = []; }) }, 'すべて表示')) : null,
  );
  return [
    flowBox,
    catBox,
    section('並べ方',
      segmented(L.columns, [{ value: 1, label: '1段' }, { value: 2, label: '2段' }, { value: 3, label: '3段' }], (v) => setEl(e.id, (x) => { x.layout.columns = Number(v); }), { label: '段組み' }),
      row(numField('料理の間隔', L.itemGap, setL('itemGap', true), { step: 0.5, min: 0, unit: 'mm' }), numField('カテゴリーの間隔', L.categoryGap, setL('categoryGap', true), { step: 0.5, min: 0, unit: 'mm' })),
      L.columns > 1 ? numField('段の間隔', L.columnGap, setL('columnGap', true), { step: 1, min: 0, unit: 'mm' }) : null,
      checkField('カテゴリー名を表示', L.showCategory, setL('showCategory')),
      checkField('説明文を表示', L.showDescription, setL('showDescription')),
      checkField('価格までの点線（リーダー）', L.leader, setL('leader')),
      checkField('料理写真を表示', L.showPhotos, setL('showPhotos')),
      L.showPhotos ? row(
        numField('写真の大きさ', L.photoSize, setL('photoSize', true), { step: 1, min: 5, unit: 'mm' }),
        selectField('写真の形', L.photoShape, [{ value: 'rect', label: '四角' }, { value: 'rounded', label: '角丸' }, { value: 'circle', label: '丸' }], setL('photoShape')),
      ) : null,
    ),
    textStyleSection('カテゴリー名の書式', e.styles.category, setS('category')),
    textStyleSection('料理名の書式', e.styles.name, setS('name'), { withAlign: false }),
    textStyleSection('説明文の書式', e.styles.desc, setS('desc'), { withAlign: false }),
    textStyleSection('価格の書式', e.styles.price, setS('price'), { withAlign: false }),
    section('補足表示（おすすめ等）', colorField('色', e.styles.badgeColor, (v) => setEl(e.id, (x) => { x.styles.badgeColor = v; }, 'badge'))),
  ];
}

function pageProps() {
  const pg = currentPage();
  const p = state.project;
  const idx = p.pages.indexOf(pg);
  const bg = pg.background;
  const ul = pg.underlay;
  const pickInto = (target) => async () => {
    const [f] = await pickFiles({ accept: IMAGE_ACCEPT });
    if (!f) return;
    try {
      const a = await addImageFile(f, target === 'underlay' ? 'import' : 'design');
      setPage((x, q) => {
        q.libraryAssetIds = [...new Set([...(q.libraryAssetIds || []), a.id])];
        if (target === 'underlay') x.underlay = { ...x.underlay, assetId: a.id, visible: true };
        else x.background = { ...x.background, assetId: a.id, locked: true };
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return [
    el('div', { class: 'props-title' }, `${idx + 1}ページ目の設定`, el('small', {}, '要素をクリックすると、その要素の設定が表示されます')),
    section('背景',
      colorField('背景色', bg.color, (v) => setPage((x) => { x.background.color = v; }, 'bgc')),
      bg.assetId ? el('div', { class: 'img-preview' }, el('img', { src: assetURL(bg.assetId), alt: '' })) : null,
      buttons(
        { label: bg.assetId ? '背景画像を変更' : '背景画像を設定', onClick: pickInto('background') },
        bg.assetId ? { label: '背景画像を外す', onClick: () => setPage((x) => { x.background.assetId = null; }) } : null,
      ),
      bg.assetId ? segmented(bg.fit, [{ value: 'cover', label: '用紙いっぱい' }, { value: 'contain', label: '全体を収める' }], (v) => setPage((x) => { x.background.fit = v; }), { label: '背景画像の配置' }) : null,
      bg.assetId ? rangeField('背景画像の透明度', bg.opacity ?? 1, (v) => setPage((x) => { x.background.opacity = v; }, 'bgo'), { format: (v) => `${Math.round(v * 100)}%` }) : null,
      checkField('背景をロック', bg.locked, (v) => setPage((x) => { x.background.locked = v; })),
      el('p', { class: 'hint' }, '紙の質感や既存メニューのデザインを背景にできます。背景はクリックしても選択されないので、誤って動かすことはありません。'),
    ),
    section('下敷き（作り直し用・印刷されません）',
      ul.assetId ? el('div', { class: 'img-preview' }, el('img', { src: assetURL(ul.assetId), alt: '' })) : el('p', { class: 'hint' }, '今のメニューを下敷きにして、その上に文字や写真枠を置き直すと、編集できるテンプレートが作れます。'),
      buttons(
        { label: '今のメニューを取り込む', primary: !ul.assetId, onClick: () => importExistingMenu() },
        { label: ul.assetId ? '画像を変更' : '画像から設定', onClick: pickInto('underlay') },
        ul.assetId ? { label: '下敷きを外す', onClick: () => setPage((x) => { x.underlay.assetId = null; }) } : null,
      ),
      ul.assetId ? rangeField('下敷きの濃さ', ul.opacity, (v) => setPage((x) => { x.underlay.opacity = v; }, 'ulo'), { min: 0.05, max: 1, format: (v) => `${Math.round(v * 100)}%` }) : null,
      ul.assetId ? checkField('下敷きを表示', ul.visible, (v) => setPage((x) => { x.underlay.visible = v; })) : null,
      ul.assetId ? checkField('下敷きを前面に重ねる（位置合わせ用）', ul.onTop, (v) => setPage((x) => { x.underlay.onTop = v; })) : null,
      ul.assetId ? segmented(ul.fit || 'contain', [{ value: 'contain', label: '全体を収める' }, { value: 'cover', label: '用紙いっぱい' }], (v) => setPage((x) => { x.underlay.fit = v; }), { label: '下敷きの配置' }) : null,
    ),
  ];
}

function multiProps(items) {
  return [
    el('div', { class: 'props-title' }, `${items.length}個を選択中`),
    section('整列（選択した要素どうし）',
      buttons(
        { label: '左', onClick: () => align('left') }, { label: '左右中央', onClick: () => align('center') }, { label: '右', onClick: () => align('right') },
        { label: '上', onClick: () => align('top') }, { label: '上下中央', onClick: () => align('middle') }, { label: '下', onClick: () => align('bottom') },
      ),
      buttons({ label: '横の間隔をそろえる', onClick: () => distribute('h') }, { label: '縦の間隔をそろえる', onClick: () => distribute('v') }),
    ),
    section('重なり順', buttons({ label: '最前面', onClick: () => reorder('front') }, { label: '最背面', onClick: () => reorder('back') })),
    section('',
      buttons(
        { label: 'まとめてロック', onClick: () => update((p) => p.pages.forEach((pg) => pg.elements.forEach((e) => { if (state.selection.includes(e.id)) e.locked = true; }))) },
        { label: '複製', onClick: () => duplicateSelected() },
        { label: '削除', danger: true, onClick: () => deleteSelected() },
      )),
  ];
}

export function render() {
  if (!root || !state.project) return;
  const items = selectedElements();
  let content;
  if (!items.length) content = pageProps();
  else if (items.length > 1) content = multiProps(items);
  else {
    const e = items[0];
    const typeLabel = { text: '文字', image: e.role === 'photo' ? '写真枠' : '画像', shape: '図形', menu: '料理リスト' }[e.type];
    const specific = e.type === 'text' ? textProps(e) : e.type === 'image' ? imageProps(e) : e.type === 'shape' ? shapeProps(e) : e.type === 'menu' ? menuProps(e) : [];
    content = [
      el('div', { class: 'props-title' }, typeLabel, e.locked ? el('small', { class: 'warn-text' }, '🔒 ロック中（位置や大きさは変更できません。下の「ロック」を外すと編集できます）') : null),
      ...specific,
      commonSection(e),
    ];
  }
  const scroll = root.scrollTop;
  root.replaceChildren(...content.filter(Boolean));
  root.scrollTop = scroll;
}

export function renderIssues() {
  if (!issuesRoot || !state.project) return;
  const p = state.project;
  const list = view.issues.filter((i) => i.level !== 'info');
  issuesRoot.replaceChildren();
  if (!list.length) {
    issuesRoot.append(el('div', { class: 'issues ok' }, '✓ はみ出し・印刷範囲外・解像度の問題はありません'));
    return;
  }
  const seen = new Set();
  const items = [];
  for (const i of list) {
    const k = `${i.elId}:${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const n = p.pages.findIndex((x) => x.id === i.pageId) + 1;
    items.push(el('li', { class: i.level },
      el('button', { class: 'linklike', onclick: () => i.elId && scrollToElement(i.elId) }, `${n}ページ`),
      ' ', i.message));
  }
  issuesRoot.append(el('details', { class: 'issues', open: list.some((i) => i.level === 'error') },
    el('summary', {}, `⚠ 確認が必要な点が${items.length}件あります`),
    el('ul', {}, items)));
}
