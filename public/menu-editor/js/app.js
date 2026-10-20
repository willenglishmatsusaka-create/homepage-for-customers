// 起動・画面の切り替え（メニュー一覧 ⇔ 編集画面）・ツールバー・キーボード操作

import { el, toast, dialog, confirmDialog, promptDialog, pickFiles, formatDate, uid, clone } from './util.js';
import { db, loadAllAssets, requestPersistence, storageEstimate, assetURL } from './db.js';
import { normalizeProject, newProject } from './model.js';
import { TEMPLATES } from './templates.js';
import { exportProjects, importBackup, BACKUP_EXT } from './backup.js';
import { printProject } from './print.js';
import { importExistingMenu } from './importer.js';
import {
  state, subscribe, loadProject, undo, redo, canUndo, canRedo, flushSave, saveNow, select, emit, update,
} from './store.js';
import { initCanvas, setZoom, zoomToFit, view, renderOverlays, exitCrop, scrollToElement, setDishEditHandler } from './canvas.js';
import { initDishes, focusDish } from './ui-dishes.js';
import { initAssets } from './ui-assets.js';
import { initPages } from './ui-pages.js';
import { initProps } from './ui-props.js';
import { addElement, deleteSelected, duplicateSelected, copySelected, paste, nudge } from './ops.js';
import { duplicatePageData } from './ui-pages.js';

const app = document.getElementById('app');
let editorBuilt = false;
let editorRoot;

const BACKUP_HELP = el('div', {},
  el('p', {}, '作成したメニューと取り込んだ画像は、このパソコンのブラウザの中にだけ保存されています（インターネット上には送信・保存されません）。'),
  el('p', {}, el('strong', {}, '次のようなときにデータが消えることがあります：')),
  el('ul', {},
    el('li', {}, 'ブラウザの「閲覧履歴データの削除」で「Cookie と他のサイトデータ」を削除したとき'),
    el('li', {}, 'シークレットウィンドウ（プライベートブラウズ）で使ったとき'),
    el('li', {}, 'パソコンの買い替え・初期化、ブラウザの再インストール')),
  el('p', {}, el('strong', {}, 'バックアップのしかた：')),
  el('ol', {},
    el('li', {}, '「バックアップを書き出す」を押すと、画像も含めた編集データが 1 つのファイル（', el('code', {}, BACKUP_EXT), '）として保存されます。'),
    el('li', {}, 'そのファイルを USB メモリや共有フォルダ、クラウドドライブなどに保管してください。'),
    el('li', {}, '別のパソコンやブラウザでは、メニュー一覧の「バックアップから読み込む」でそのファイルを選ぶと元どおりになります。')),
  el('p', { class: 'muted' }, 'メニューを大きく変更したときや、印刷する前にバックアップしておくと安心です。'),
);

function showBackupHelp() {
  return dialog({ title: 'データの保存とバックアップについて', body: BACKUP_HELP.cloneNode(true), wide: true, buttons: [{ label: '閉じる', value: true, primary: true }] });
}

// ─── メニュー一覧 ───────────────────────────────────────

async function createFromTemplate(t) {
  const p = t.make();
  await db.putProject(p);
  location.hash = `#/edit/${p.id}`;
}

async function createFromExisting() {
  const p = newProject({ name: '取り込んだメニュー' });
  await db.putProject(p);
  location.hash = `#/edit/${p.id}`;
  setTimeout(() => importExistingMenu(), 300);
}

async function duplicateProject(p, name) {
  const copy = clone(p);
  copy.id = uid('menu');
  copy.name = name;
  copy.createdAt = copy.updatedAt = Date.now();
  copy.lastBackupAt = null;
  copy.pages = copy.pages.map(duplicatePageData);
  await db.putProject(copy);
  return copy;
}

async function renderHome() {
  document.title = 'メニュー編集ツール';
  if (editorRoot) editorRoot.hidden = true;
  const projects = (await db.listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
  const lastBackup = await db.getMeta('lastBackupAt');
  const est = await storageEstimate();
  const persisted = await requestPersistence();
  const needsBackup = projects.length && (!lastBackup || projects.some((p) => p.updatedAt > (p.lastBackupAt || 0) && Date.now() - (p.lastBackupAt || 0) > 3 * 864e5));

  const home = el('div', { class: 'home' },
    el('header', { class: 'home-head' },
      el('h1', {}, 'メニュー編集ツール'),
      el('p', {}, '店内用の印刷メニューを作成・編集できます。料理名・説明・価格・写真を変えるだけで、決まったデザインに反映されます。')),
    el('div', { class: `backup-banner${needsBackup ? ' warn' : ''}` },
      el('div', {},
        el('strong', {}, needsBackup ? 'バックアップをおすすめします' : 'データはこのパソコンのブラウザ内に保存されています'),
        el('p', {}, 'ブラウザのデータを削除すると消えてしまうため、ときどき「バックアップを書き出す」でファイルに保存してください。',
          ` 最後のバックアップ：${formatDate(lastBackup)}`,
          est ? ` ・ 使用容量 約${Math.round((est.usage || 0) / 1048576)}MB` : '',
          persisted ? ' ・ 保護設定：有効' : '')),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn primary', disabled: !projects.length, onclick: async () => { const r = await exportProjects(projects); if (r) toast(`「${r.name}」を書き出しました`, 'success'); renderHome(); } }, 'すべてのメニューをバックアップ'),
        el('button', { class: 'btn', onclick: async () => {
          const [f] = await pickFiles({ accept: `${BACKUP_EXT},.json,application/json` });
          if (!f) return;
          try {
            const list = await importBackup(f);
            await loadAllAssets();
            toast(`${list.length}件のメニューを読み込みました`, 'success');
            renderHome();
          } catch (err) {
            toast(err.message, 'error');
          }
        } }, 'バックアップから読み込む'),
        el('button', { class: 'btn ghost', onclick: showBackupHelp }, '詳しく'))),
    el('h2', {}, '新しく作る'),
    el('div', { class: 'template-grid' },
      TEMPLATES.map((t) => el('button', { class: 'template-card', onclick: () => createFromTemplate(t) },
        el('span', { class: `tpl-thumb tpl-${t.key}` }, el('i'), el('i'), el('i')),
        el('strong', {}, t.label), el('small', {}, t.desc))),
      el('button', { class: 'template-card import', onclick: createFromExisting },
        el('span', { class: 'tpl-thumb tpl-import' }, '⇪'),
        el('strong', {}, '今のメニューを取り込んで作る'),
        el('small', {}, '画像・PDF を背景にする、または下敷きにして編集できる形に作り直します。'))),
    el('h2', {}, '保存済みのメニュー'),
    projects.length ? el('div', { class: 'project-list' }, projects.map((p) => projectCard(p))) : el('p', { class: 'muted' }, 'まだメニューがありません。上のテンプレートから作成してください。'),
    el('footer', { class: 'home-foot' }, '取り込んだ写真や画像は外部に送信されず、このパソコンの中だけで処理・保存されます。'),
  );
  app.querySelector('.home')?.remove();
  app.prepend(home);
}

function projectCard(p) {
  const firstBg = p.pages[0]?.background.assetId || p.pages[0]?.underlay.assetId;
  const stale = p.updatedAt > (p.lastBackupAt || 0);
  return el('div', { class: 'project-card' },
    el('a', { class: 'project-open', href: `#/edit/${p.id}` },
      el('span', { class: `project-thumb${p.paper.orientation === 'landscape' ? ' land' : ''}` }, firstBg ? el('img', { src: assetURL(firstBg), alt: '' }) : el('span', {}, p.name.slice(0, 1))),
      el('span', { class: 'project-meta' },
        el('strong', {}, p.name),
        el('small', {}, `A4${p.paper.orientation === 'landscape' ? '横' : '縦'} ・ ${p.pages.length}ページ ・ 料理${p.dishes.length}品`),
        el('small', {}, `更新：${formatDate(p.updatedAt)}`),
        el('small', { class: stale ? 'warn-text' : 'muted' }, `バックアップ：${p.lastBackupAt ? formatDate(p.lastBackupAt) : 'まだしていません'}`))),
    el('div', { class: 'btn-row' },
      el('a', { class: 'btn small primary', href: `#/edit/${p.id}` }, '開く'),
      el('button', { class: 'btn small', title: '季節メニューなどに使うため、別名で複製します', onclick: async () => {
        const name = await promptDialog('複製して別名で保存', '新しいメニューの名前', `${p.name}（コピー）`);
        if (!name) return;
        await duplicateProject(p, name);
        toast(`「${name}」を作成しました`, 'success');
        renderHome();
      } }, '複製'),
      el('button', { class: 'btn small', onclick: async () => {
        const name = await promptDialog('名前を変更', 'メニューの名前', p.name);
        if (!name) return;
        p.name = name;
        await db.putProject(p);
        renderHome();
      } }, '名前を変更'),
      el('button', { class: 'btn small', onclick: async () => { const r = await exportProjects([p]); if (r) toast(`「${r.name}」を書き出しました`, 'success'); renderHome(); } }, 'バックアップ'),
      el('button', { class: 'btn small danger', onclick: async () => {
        if (!(await confirmDialog('メニューを削除', `「${p.name}」を削除しますか？元に戻せません。必要ならバックアップを書き出してから削除してください。`, '削除する', true))) return;
        await db.deleteProject(p.id);
        renderHome();
      } }, '削除')));
}

// ─── 編集画面 ───────────────────────────────────────

function toolButton(label, onClick, { title, cls = '' } = {}) {
  return el('button', { class: `tool ${cls}`, title: title || label, onclick: onClick }, label);
}

function dropdown(label, items) {
  const menu = el('div', { class: 'dropdown-menu' }, items.map((it) => el('button', { onclick: () => { wrap.classList.remove('open'); it.onClick(); } }, it.label)));
  const wrap = el('div', { class: 'dropdown' }, el('button', { class: 'tool', onclick: (e) => { e.stopPropagation(); document.querySelectorAll('.dropdown.open').forEach((d) => d !== wrap && d.classList.remove('open')); wrap.classList.toggle('open'); } }, `${label} ▾`), menu);
  return wrap;
}

function buildEditor() {
  const nameInput = el('input', { class: 'name-input', type: 'text', title: 'メニューの名前', 'aria-label': 'メニューの名前' });
  nameInput.addEventListener('input', () => update((p) => { p.name = nameInput.value; }, { key: 'name', render: 'status' }));
  const status = el('span', { class: 'save-status' });
  const undoBtn = toolButton('↶ 元に戻す', () => undo(), { title: '元に戻す（Ctrl+Z）' });
  const redoBtn = toolButton('↷ やり直し', () => redo(), { title: 'やり直し（Ctrl+Shift+Z）' });
  const zoomLabel = el('button', { class: 'tool zoom-label', title: '全体を表示', onclick: () => zoomToFit() });
  const issuesBtn = el('button', { class: 'tool issues-btn', onclick: () => {
    const first = view.issues.find((i) => i.level === 'error') || view.issues.find((i) => i.level === 'warn');
    if (first?.elId) scrollToElement(first.elId);
  } });
  const guidesBtn = toolButton('ガイド', () => { view.showGuides = !view.showGuides; guidesBtn.classList.toggle('on', view.showGuides); renderOverlays(); }, { title: '印刷できない余白の目安を表示', cls: 'on' });

  const printBtn = toolButton('印刷・PDF保存', async () => {
    exitCrop();
    select([]);
    await printProject(state.project, { onShowIssue: (i) => i.elId && scrollToElement(i.elId) });
  }, { cls: 'primary print-btn', title: '印刷画面で「送信先：PDFに保存」を選ぶと PDF にできます（Ctrl+P）' });
  const backupBtn = toolButton('バックアップ', async () => {
    flushSave();
    await saveNow();
    const r = await exportProjects([state.project]);
    if (r) toast(`「${r.name}」を書き出しました。USBメモリやクラウドドライブなどに保管してください。`, 'success');
    emit('status');
  }, { title: '画像を含む編集データ一式をファイルに書き出します' });
  const topbar = el('header', { class: 'topbar' },
    el('div', { class: 'bar-row' },
      el('a', { class: 'tool back', href: '#/', title: 'メニュー一覧に戻る' }, '← メニュー一覧'),
      nameInput, status,
      el('span', { class: 'sep' }),
      undoBtn, redoBtn,
      el('span', { class: 'spacer' }),
      issuesBtn,
      backupBtn,
      printBtn),
    el('div', { class: 'bar-row secondary' },
      el('span', { class: 'bar-label' }, '追加：'),
      toolButton('文字', () => addElement('text')),
      toolButton('見出し', () => addElement('heading')),
      toolButton('写真枠', () => addElement('photo')),
      toolButton('料理リスト', () => addElement('menu'), { title: '登録した料理を決まった書式で並べる枠' }),
      dropdown('図形・線', [
        { label: '四角形（元の文字を隠すのにも）', onClick: () => addElement('rect') },
        { label: '円', onClick: () => addElement('ellipse') },
        { label: '区切り線', onClick: () => addElement('line') },
        { label: '空の画像枠（デザイン素材用）', onClick: () => addElement('image') },
      ]),
      el('span', { class: 'sep' }),
      toolButton('既存メニューを取り込む', () => importExistingMenu(), { title: '今使っているメニューの画像・PDFを背景や下敷きにします' }),
      el('span', { class: 'spacer' }),
      toolButton('－', () => setZoom(state.zoom / 1.15), { title: '縮小' }), zoomLabel, toolButton('＋', () => setZoom(state.zoom * 1.15), { title: '拡大' }),
      guidesBtn),
  );

  const tabs = [
    ['dishes', '料理'],
    ['assets', '素材'],
    ['pages', 'ページ'],
    ['layers', 'レイヤー'],
  ];
  const panes = Object.fromEntries(tabs.map(([k]) => [k, el('div', { class: 'tab-pane', dataset: { pane: k }, hidden: k !== 'dishes' })]));
  const tabBar = el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label]) => el('button', {
    class: `tab${k === 'dishes' ? ' on' : ''}`, role: 'tab', dataset: { tab: k },
    onclick: () => {
      tabBar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === k));
      Object.entries(panes).forEach(([pk, pane]) => (pane.hidden = pk !== k));
    },
  }, label)));
  const left = el('aside', { class: 'side left', 'aria-label': '素材・料理情報' }, tabBar, ...Object.values(panes));
  const canvas = el('main', { class: 'canvas-scroll', 'aria-label': 'メニューの編集・プレビュー' });
  const props = el('div', { class: 'props' });
  const issues = el('div', { class: 'issues-box' });
  const right = el('aside', { class: 'side right', 'aria-label': '選択した要素の設定' }, issues, props);

  editorRoot = el('div', { class: 'editor' }, topbar, el('div', { class: 'workspace' }, left, canvas, right));
  app.append(editorRoot);

  initCanvas(canvas);
  initDishes(panes.dishes);
  initAssets(panes.assets);
  initPages(panes.pages, panes.layers);
  initProps(props, issues);
  setDishEditHandler((id, field) => focusDish(id, field));

  const refreshBar = () => {
    if (!state.project) return;
    if (document.activeElement !== nameInput) nameInput.value = state.project.name;
    document.title = `${state.project.name} - メニュー編集ツール`;
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
    status.textContent = state.saveStatus === 'error' ? '⚠ 保存できませんでした' : state.saveStatus === 'pending' ? '保存中…' : '✓ 自動保存済み';
    status.className = `save-status ${state.saveStatus}`;
  };
  subscribe((what) => {
    if (['all', 'status', 'canvas', 'assets', 'dishes'].includes(what)) refreshBar();
    if (what === 'zoom' || what === 'all') zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    if (what === 'issues' || what === 'all') {
      const err = view.issues.filter((i) => i.level === 'error').length;
      const warn = view.issues.filter((i) => i.level === 'warn').length;
      issuesBtn.textContent = err ? `⚠ ${err}件の問題` : warn ? `△ ${warn}件の注意` : '✓ 問題なし';
      issuesBtn.className = `tool issues-btn ${err ? 'error' : warn ? 'warn' : 'ok'}`;
    }
  });
  document.addEventListener('click', () => document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open')));
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', () => flushSave());
  document.addEventListener('visibilitychange', () => document.hidden && flushSave());
  editorBuilt = true;
}

function isTyping(e) {
  const t = e.target;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

function onKey(e) {
  if (!editorRoot || editorRoot.hidden || document.querySelector('.modal-backdrop')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !isTyping(e)) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y' && !isTyping(e)) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    editorRoot.querySelector('.print-btn')?.click();
    return;
  }
  if (isTyping(e)) return;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (mod && e.key.toLowerCase() === 'c') { copySelected(); return; }
  if (mod && e.key.toLowerCase() === 'v') { paste(); return; }
  if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    const pg = state.project.pages.find((p) => p.id === state.pageId);
    select(pg.elements.filter((x) => !x.locked && !x.hidden).map((x) => x.id));
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  if (e.key === 'Escape' || e.key === 'Enter') {
    if (state.cropMode) { exitCrop(); emit('selection'); return; }
    if (e.key === 'Escape') select([]);
    return;
  }
  const step = e.shiftKey ? 5 : 0.5;
  const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (arrows[e.key] && state.selection.length) {
    e.preventDefault();
    nudge(...arrows[e.key]);
  }
}

async function openEditor(id) {
  const raw = await db.getProject(id);
  if (!raw) {
    toast('メニューが見つかりませんでした', 'error');
    location.hash = '#/';
    return;
  }
  app.querySelector('.home')?.remove();
  if (!editorBuilt) buildEditor();
  editorRoot.hidden = false;
  loadProject(normalizeProject(raw));
  requestAnimationFrame(() => zoomToFit());
}

async function route() {
  flushSave();
  const m = location.hash.match(/^#\/edit\/(.+)$/);
  if (m) await openEditor(decodeURIComponent(m[1]));
  else {
    state.project = null;
    await renderHome();
  }
}

async function start() {
  try {
    await loadAllAssets();
  } catch (err) {
    app.replaceChildren(el('div', { class: 'home' }, el('h1', {}, 'メニュー編集ツール'), el('p', { class: 'warn-text' }, `ブラウザ内の保存領域を使えません（${err.message}）。シークレットウィンドウではなく、通常のウィンドウで開いてください。`)));
    return;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => state.project && renderOverlays());
  route();
}

start();
