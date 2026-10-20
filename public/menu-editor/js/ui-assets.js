// 左パネル「素材」：取り込んだ画像の一覧

import { el, toast, pickFiles, confirmDialog, dialog } from './util.js';
import { assetURL, allAssets, db, forgetAsset } from './db.js';
import { addImageFiles, IMAGE_ACCEPT, isImageFile, isPdfFile } from './assets.js';
import { importExistingMenu } from './importer.js';
import { state, update, subscribe, selectedElements, currentPage } from './store.js';
import { placeAsset } from './canvas.js';
import { referencedAssetIds } from './model.js';

let root;
let filter = 'all';
let showAll = false;

const KIND_LABEL = { design: 'デザイン素材', photo: '料理写真', import: '取り込んだメニュー' };

export function initAssets(container) {
  root = container;
  subscribe((what) => {
    if (what === 'all' || what === 'assets') render();
  });
}

async function upload(files, kind) {
  const pdfs = files.filter(isPdfFile);
  if (pdfs.length) await importExistingMenu(pdfs);
  const imgs = files.filter(isImageFile);
  if (!imgs.length) return;
  const added = await addImageFiles(imgs, kind);
  if (added.length) {
    update((p) => { p.libraryAssetIds = [...new Set([...(p.libraryAssetIds || []), ...added.map((a) => a.id)])]; }, { render: 'assets' });
    toast(`${added.length}枚の画像を素材一覧に保存しました。ページにドラッグして配置できます。`, 'success');
  }
}

function usedIn(id) {
  return referencedAssetIds(state.project).has(id);
}

async function assetMenu(a) {
  const sel = selectedElements();
  const frame = sel.length === 1 && sel[0].type === 'image' ? sel[0] : null;
  const pg = currentPage();
  const choice = await dialog({
    title: a.name,
    body: el('div', { class: 'asset-detail' },
      el('img', { src: assetURL(a.id), alt: '' }),
      el('p', { class: 'muted' }, `${a.width} × ${a.height} px ・ ${KIND_LABEL[a.kind] || ''}${a.type === 'image/png' ? ' ・ PNG（透過を保持）' : ''}`),
      a.width < 1200 ? el('p', { class: 'warn-text' }, '画像が小さめです。大きく印刷するとぼやけることがあります。') : null),
    buttons: [
      { label: '閉じる', value: null },
      { label: '削除', value: 'delete', danger: true },
      { label: '下敷きにする', value: 'underlay' },
      { label: '背景にする', value: 'background' },
      frame ? { label: '選択中の枠に入れる', value: 'frame' } : null,
      { label: 'ページに配置', value: 'place', primary: true },
    ].filter(Boolean),
  });
  if (choice === 'place') placeAsset(pg.id, a.id, null);
  else if (choice === 'frame') placeAsset(pg.id, a.id, null, frame);
  else if (choice === 'background') {
    update((p) => { const x = p.pages.find((q) => q.id === pg.id); x.background = { ...x.background, assetId: a.id, locked: true }; });
    toast('ページの背景に設定しました（ロック中）。', 'success');
  } else if (choice === 'underlay') {
    update((p) => { const x = p.pages.find((q) => q.id === pg.id); x.underlay = { ...x.underlay, assetId: a.id, visible: true }; });
    toast('下敷きに設定しました。下敷きは印刷されません。', 'success');
  } else if (choice === 'delete') {
    const projects = await db.listProjects();
    const users = projects.filter((p) => p.id !== state.project.id && referencedAssetIds(p).has(a.id));
    if (usedIn(a.id)) {
      toast('このメニューで使用中の画像は削除できません。先にページや料理から外してください。', 'error');
      return;
    }
    if (users.length) {
      if (!(await confirmDialog('素材一覧から外す', `この画像はほかのメニュー（${users.map((u) => u.name).join('、')}）で使われています。このメニューの素材一覧から外しますか？`, '外す'))) return;
      update((p) => { p.libraryAssetIds = (p.libraryAssetIds || []).filter((x) => x !== a.id); }, { render: 'assets' });
      return;
    }
    if (!(await confirmDialog('画像を削除', 'この画像を削除しますか？元に戻せません。', '削除する', true))) return;
    update((p) => { p.libraryAssetIds = (p.libraryAssetIds || []).filter((x) => x !== a.id); }, { render: 'assets' });
    await db.deleteAsset(a.id);
    forgetAsset(a.id);
    render();
  }
}

export function render() {
  if (!root || !state.project) return;
  const mine = referencedAssetIds(state.project);
  const list = allAssets().filter((a) => (showAll || mine.has(a.id)) && (filter === 'all' || a.kind === filter));
  const drop = el('div', { class: 'dropzone' },
    el('p', {}, 'ここに画像をドロップ'),
    el('small', {}, 'JPEG・PNG・WebP（透過PNGもそのまま使えます）'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn small primary', onclick: async () => upload(await pickFiles({ accept: IMAGE_ACCEPT, multiple: true }), 'design') }, 'デザイン素材を追加'),
      el('button', { class: 'btn small', onclick: async () => upload(await pickFiles({ accept: IMAGE_ACCEPT, multiple: true }), 'photo') }, '料理写真を追加')),
  );
  drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files], 'design'); });

  const chips = el('div', { class: 'chips' }, [['all', 'すべて'], ['design', 'デザイン素材'], ['photo', '料理写真'], ['import', '取り込んだメニュー']].map(([k, label]) =>
    el('button', { class: `chip${filter === k ? ' on' : ''}`, onclick: () => { filter = k; render(); } }, label)));
  const grid = el('div', { class: 'asset-grid' }, list.map((a) => {
    const item = el('button', { class: 'asset', title: `${a.name}（${a.width}×${a.height}px）\nクリックで操作を選択／ページにドラッグで配置`, draggable: 'true', onclick: () => assetMenu(a) },
      el('img', { src: assetURL(a.id), alt: a.name, draggable: 'false' }),
      a.width < 1200 ? el('span', { class: 'asset-warn', title: '小さめの画像' }, '!') : null);
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-menu-asset', a.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    return item;
  }));
  root.replaceChildren(
    el('p', { class: 'panel-help' }, '取り込んだ画像はこの端末のブラウザ内に保存され、外部には送信されません。ほかのページやメニューでも使えます。'),
    drop,
    el('button', { class: 'btn block', onclick: () => importExistingMenu() }, '今のメニュー（画像・PDF）を取り込む'),
    chips,
    el('label', { class: 'check small pad' }, Object.assign(el('input', { type: 'checkbox', checked: showAll }), { onchange: (e) => { showAll = e.target.checked; render(); } }), ' ほかのメニューの素材も表示'),
    list.length ? grid : el('p', { class: 'muted pad' }, 'まだ素材がありません。'),
  );
}
