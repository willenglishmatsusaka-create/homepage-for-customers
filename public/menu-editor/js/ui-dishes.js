// 左パネル「料理」：料理情報の登録・編集

import { el, confirmDialog, promptDialog, dialog, toast, pickFiles, formatPrice } from './util.js';
import { assetURL } from './db.js';
import { newDish, newCategory, BADGES, categoryName } from './model.js';
import { addImageFile, IMAGE_ACCEPT, isImageFile } from './assets.js';
import { state, update, subscribe } from './store.js';
import { textField, checkField } from './fields.js';

let root;
let openDishId = null;
let filterCat = 'all';

export function initDishes(container) {
  root = container;
  subscribe((what) => {
    if (what === 'all' || what === 'dishes') render();
  });
}

export function focusDish(dishId, field = 'name') {
  openDishId = dishId;
  document.querySelector('[data-tab="dishes"]')?.click();
  render();
  const card = root.querySelector(`.dish[data-id="${dishId}"]`);
  card?.scrollIntoView({ block: 'nearest' });
  const input = card?.querySelector(`[data-field="${field === 'badges' || field === 'category' ? 'name' : field}"]`);
  input?.focus();
}

const setDish = (id, fn, key) =>
  update((p) => {
    const d = p.dishes.find((x) => x.id === id);
    if (d) fn(d, p);
  }, { key: key ? `dish:${id}:${key}` : null, render: key ? 'canvas' : 'all' });

async function setDishPhoto(id, file) {
  try {
    const a = await addImageFile(file, 'photo');
    update((p) => {
      const d = p.dishes.find((x) => x.id === id);
      d.photoAssetId = a.id;
      d.showPhoto = true;
      p.libraryAssetIds = [...new Set([...(p.libraryAssetIds || []), a.id])];
    });
    toast('料理写真を設定しました。写真枠の位置や大きさはそのままです。', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function moveDish(id, dir) {
  update((p) => {
    const i = p.dishes.findIndex((d) => d.id === id);
    const cat = p.dishes[i].categoryId;
    let j = i + dir;
    while (j >= 0 && j < p.dishes.length && p.dishes[j].categoryId !== cat) j += dir;
    if (j < 0 || j >= p.dishes.length) return;
    const [d] = p.dishes.splice(i, 1);
    p.dishes.splice(j, 0, d);
  });
}

function dishEditor(d) {
  const p = state.project;
  const photo = el('div', { class: 'dish-photo-edit' });
  const thumb = d.photoAssetId
    ? el('img', { src: assetURL(d.photoAssetId), alt: '' })
    : el('span', { class: 'muted' }, '写真なし');
  photo.append(
    el('div', { class: 'thumb-lg' }, thumb),
    el('div', { class: 'col' },
      el('button', { class: 'btn small', onclick: async () => { const [f] = await pickFiles({ accept: IMAGE_ACCEPT }); if (f) setDishPhoto(d.id, f); } }, d.photoAssetId ? '写真を差し替え' : '写真を選ぶ'),
      d.photoAssetId ? el('button', { class: 'btn small', onclick: () => setDish(d.id, (x) => { x.photoAssetId = null; }) }, '写真を外す') : null,
      checkField('写真を表示する', d.showPhoto !== false, (v) => setDish(d.id, (x) => { x.showPhoto = v; })),
      el('small', { class: 'hint' }, 'ここに画像をドロップしても設定できます'),
    ),
  );
  const catSel = el('select', { class: 'input' },
    el('option', { value: '' }, '未分類'),
    p.categories.map((c) => el('option', { value: c.id, selected: c.id === d.categoryId }, c.name)));
  catSel.addEventListener('change', () => setDish(d.id, (x) => { x.categoryId = catSel.value || null; }));
  const badgeBox = el('div', { class: 'badge-checks' },
    [...new Set([...BADGES, ...(d.badges || [])])].map((b) =>
      checkField(b, d.badges?.includes(b), (on) => setDish(d.id, (x) => {
        x.badges = on ? [...(x.badges || []), b] : (x.badges || []).filter((y) => y !== b);
      }))),
    el('button', { class: 'btn tiny', onclick: async () => {
      const b = await promptDialog('補足表示を追加', '表示する文字（例：辛口、ハーフサイズ可）');
      if (b) setDish(d.id, (x) => { x.badges = [...new Set([...(x.badges || []), b])]; });
    } }, '＋ 追加'));

  const name = textField('料理名', d.name, (v) => { setDish(d.id, (x) => { x.name = v; }, 'name'); updateRow(d.id); });
  name.querySelector('input').dataset.field = 'name';
  const desc = textField('説明文', d.description, (v) => setDish(d.id, (x) => { x.description = v; }, 'description'), { multiline: true, rows: 2 });
  desc.querySelector('textarea').dataset.field = 'description';
  const price = textField('価格', d.price, (v) => { setDish(d.id, (x) => { x.price = v; }, 'price'); updateRow(d.id); }, {
    placeholder: '1800 / 時価 / 2,000〜',
    hint: p.priceFormat === 'yen' ? '数字だけなら「¥1,800」と表示します。「時価」などの文字もそのまま使えます。' : '入力したとおりに表示します。',
  });
  price.querySelector('input').dataset.field = 'price';
  return el('div', { class: 'dish-editor' },
    name, desc, price,
    el('label', { class: 'field' }, el('span', {}, 'カテゴリー'), catSel),
    el('div', { class: 'field' }, el('span', {}, '料理写真'), photo),
    el('div', { class: 'field' }, el('span', {}, '補足表示'), badgeBox),
  );
}

function updateRow(id) {
  const d = state.project.dishes.find((x) => x.id === id);
  const row = root.querySelector(`.dish[data-id="${id}"]`);
  if (!d || !row) return;
  row.querySelector('.dish-name').textContent = d.name || '（名前なし）';
  row.querySelector('.dish-price').textContent = formatPrice(d.price, state.project.priceFormat);
}

function dishRow(d) {
  const open = openDishId === d.id;
  const row = el('div', { class: `dish${open ? ' open' : ''}`, dataset: { id: d.id } });
  // 写真をドロップ
  row.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('Files') || [...e.dataTransfer.types].includes('application/x-menu-asset')) {
      e.preventDefault();
      row.classList.add('drop-target');
    } else if ([...e.dataTransfer.types].includes('application/x-menu-dish')) {
      e.preventDefault();
      row.classList.add('drop-before');
    }
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-target', 'drop-before'));
  row.addEventListener('drop', (e) => {
    row.classList.remove('drop-target', 'drop-before');
    const assetId = e.dataTransfer.getData('application/x-menu-asset');
    const otherDish = e.dataTransfer.getData('application/x-menu-dish');
    const file = [...e.dataTransfer.files].find(isImageFile);
    if (!assetId && !file && !otherDish) return;
    e.preventDefault();
    e.stopPropagation();
    if (otherDish && otherDish !== d.id) {
      update((p) => {
        const i = p.dishes.findIndex((x) => x.id === otherDish);
        const [moved] = p.dishes.splice(i, 1);
        moved.categoryId = d.categoryId;
        p.dishes.splice(p.dishes.findIndex((x) => x.id === d.id), 0, moved);
      });
    } else if (assetId) setDish(d.id, (x) => { x.photoAssetId = assetId; x.showPhoto = true; });
    else if (file) setDishPhoto(d.id, file);
  });
  const head = el('div', { class: 'dish-head', onclick: (e) => {
    if (e.target.closest('button')) return;
    openDishId = open ? null : d.id;
    render();
    if (!open) root.querySelector(`.dish[data-id="${d.id}"] [data-field="name"]`)?.focus();
  } },
  el('span', { class: 'grip', title: 'ドラッグで並べ替え・ページに配置' }, '⋮⋮'),
  el('span', { class: 'thumb' }, d.photoAssetId ? el('img', { src: assetURL(d.photoAssetId), alt: '', class: d.showPhoto === false ? 'dim' : '' }) : ''),
  el('span', { class: 'dish-main' },
    el('span', { class: 'dish-name' }, d.name || '（名前なし）'),
    (d.badges || []).length ? el('span', { class: 'dish-badges' }, d.badges.join('・')) : null),
  el('span', { class: 'dish-price' }, formatPrice(d.price, state.project.priceFormat)),
  el('span', { class: 'dish-actions' },
    el('button', { class: 'icon-btn', title: '上へ', onclick: () => moveDish(d.id, -1) }, '↑'),
    el('button', { class: 'icon-btn', title: '下へ', onclick: () => moveDish(d.id, 1) }, '↓'),
    el('button', { class: 'icon-btn', title: '複製', onclick: () => {
      const copy = newDish({ ...structuredClone(d), id: undefined, name: `${d.name}（コピー）` });
      copy.id = newDish().id;
      update((p) => p.dishes.splice(p.dishes.findIndex((x) => x.id === d.id) + 1, 0, copy));
      openDishId = copy.id;
    } }, '⧉'),
    el('button', { class: 'icon-btn danger', title: '削除', onclick: async () => {
      const used = state.project.pages.some((pg) => pg.elements.some((e) => e.binding?.dishId === d.id));
      const ok = await confirmDialog('料理を削除', `「${d.name}」を削除しますか？${used ? '\nこの料理に紐付けた文字・写真枠は「料理が見つかりません」と表示されます。' : ''}`, '削除する', true);
      if (ok) update((p) => { p.dishes = p.dishes.filter((x) => x.id !== d.id); });
    } }, '✕'),
  ));
  head.draggable = true;
  head.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-menu-dish', d.id);
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  row.append(head);
  if (open) row.append(dishEditor(d));
  return row;
}

async function manageCategories() {
  const list = el('div', { class: 'cat-list' });
  const draw = () => {
    list.replaceChildren(...state.project.categories.map((c, i) => el('div', { class: 'cat-row' },
      el('span', { class: 'cat-name' }, c.name),
      el('span', { class: 'muted small' }, `${state.project.dishes.filter((d) => d.categoryId === c.id).length}品`),
      el('button', { class: 'icon-btn', title: '上へ', disabled: i === 0, onclick: () => { update((q) => { const [x] = q.categories.splice(i, 1); q.categories.splice(i - 1, 0, x); }); draw(); } }, '↑'),
      el('button', { class: 'icon-btn', title: '下へ', disabled: i === state.project.categories.length - 1, onclick: () => { update((q) => { const [x] = q.categories.splice(i, 1); q.categories.splice(i + 1, 0, x); }); draw(); } }, '↓'),
      el('button', { class: 'btn tiny', onclick: async () => { const n = await promptDialog('カテゴリー名を変更', 'カテゴリー名', c.name); if (n) { update((q) => { q.categories.find((x) => x.id === c.id).name = n; }); draw(); } } }, '名前を変更'),
      el('button', { class: 'btn tiny danger', onclick: async () => {
        if (await confirmDialog('カテゴリーを削除', `「${c.name}」を削除しますか？料理は「未分類」になります。`, '削除', true)) {
          update((q) => {
            q.categories = q.categories.filter((x) => x.id !== c.id);
            q.dishes.forEach((d) => { if (d.categoryId === c.id) d.categoryId = null; });
          });
          draw();
        }
      } }, '削除'),
    )));
  };
  draw();
  const body = el('div', {}, list, el('button', { class: 'btn small', onclick: async () => {
    const n = await promptDialog('カテゴリーを追加', 'カテゴリー名（例：前菜、メイン、デザート、ドリンク）');
    if (n) { update((q) => q.categories.push(newCategory(n))); draw(); }
  } }, '＋ カテゴリーを追加'), el('p', { class: 'hint' }, 'ここでの順番が、メニューに並ぶ順番になります。'));
  await dialog({ title: 'カテゴリーの管理', body, buttons: [{ label: '閉じる', value: true, primary: true }] });
}

export function render() {
  if (!root || !state.project) return;
  const p = state.project;
  const chips = el('div', { class: 'chips' },
    [{ id: 'all', name: 'すべて' }, ...p.categories].map((c) =>
      el('button', { class: `chip${filterCat === c.id ? ' on' : ''}`, onclick: () => { filterCat = c.id; render(); } }, c.name)),
    el('button', { class: 'chip ghost', onclick: manageCategories, title: 'カテゴリーの追加・名前変更・並べ替え' }, '⚙ カテゴリー'),
  );
  if (filterCat !== 'all' && !p.categories.some((c) => c.id === filterCat)) filterCat = 'all';
  const groups = [...p.categories.map((c) => c.id), null];
  const list = el('div', { class: 'dish-list' });
  for (const cid of groups) {
    if (filterCat !== 'all' && filterCat !== cid) continue;
    const dishes = p.dishes.filter((d) => (d.categoryId || null) === cid || (cid === null && d.categoryId && !p.categories.some((c) => c.id === d.categoryId)));
    if (!dishes.length && cid === null) continue;
    list.append(el('div', { class: 'dish-group-title' }, cid ? categoryName(p, cid) : '未分類', el('small', {}, ` ${dishes.length}品`)));
    for (const d of dishes) list.append(dishRow(d));
    if (!dishes.length) list.append(el('div', { class: 'muted small pad' }, '料理がありません'));
  }
  const add = el('button', { class: 'btn primary block', onclick: () => {
    const cat = filterCat !== 'all' ? filterCat : p.categories[0]?.id || null;
    const d = newDish({ categoryId: cat });
    update((q) => q.dishes.push(d));
    openDishId = d.id;
    render();
    root.querySelector(`.dish[data-id="${d.id}"] [data-field="name"]`)?.select();
  } }, '＋ 料理を追加');
  const priceFmt = checkField('数字だけの価格を「¥1,800」の形で表示', p.priceFormat === 'yen', (v) => update((q) => { q.priceFormat = v ? 'yen' : 'raw'; }));
  root.replaceChildren(
    el('p', { class: 'panel-help' }, '料理を登録すると、ページの「料理リスト」に決まった書式で並びます。料理をページにドラッグすると、紐付いた文字として配置できます。'),
    chips, add, list, el('div', { class: 'pad' }, priceFmt),
  );
}
