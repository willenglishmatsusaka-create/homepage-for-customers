// 印刷・PDF保存（ブラウザの印刷機能を使う）

import { el, dialog } from './util.js';
import { renderDocument } from './render.js';
import { fontFamilyName, FONTS } from './model.js';

function usedFonts(project) {
  const keys = new Set();
  const add = (s) => s && keys.add(s.font);
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.type === 'text') add(e.style);
      if (e.type === 'menu') Object.values(e.styles).forEach((s) => typeof s === 'object' && add(s));
    }
  }
  return [...keys].filter((k) => FONTS.some((f) => f.key === k));
}

export async function waitForFonts(project) {
  const fams = usedFonts(project).map(fontFamilyName);
  try {
    await Promise.all(
      fams.flatMap((f) => [
        document.fonts.load(`400 12pt "${f}"`, 'あ漢A1¥'),
        document.fonts.load(`700 12pt "${f}"`, 'あ漢A1¥'),
      ]),
    );
    await document.fonts.ready;
  } catch {
    /* フォントが読めなくても代わりのフォントで印刷する */
  }
}

async function waitForImages(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(
    imgs.map((img) => (img.complete && img.naturalWidth ? img.decode?.().catch(() => {}) : new Promise((r) => {
      img.onload = img.onerror = () => r();
    }))),
  );
}

function setPageRule(project) {
  let style = document.getElementById('print-page-style');
  if (!style) {
    style = el('style', { id: 'print-page-style' });
    document.head.append(style);
  }
  style.textContent = `@page { size: ${project.paper.size} ${project.paper.orientation}; margin: 0; }`;
}

// 印刷用に描画し、問題点を返す（印刷前チェックにも使う）
export async function preparePrint(project) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = el('div', { id: 'print-root', 'aria-hidden': 'true' });
    document.body.append(root);
  }
  await waitForFonts(project);
  const doc = renderDocument(project, root, 'print');
  await waitForImages(root);
  doc.flow();
  return { root, issues: doc.issues };
}

export async function printProject(project, { onShowIssue } = {}) {
  const { root, issues } = await preparePrint(project);
  const serious = issues.filter((i) => i.level !== 'info');
  const emptyFrames = issues.filter((i) => i.kind === 'empty').length;
  const hasUnderlay = project.pages.some((p) => p.underlay.assetId && p.underlay.visible);
  if (serious.length || emptyFrames || hasUnderlay) {
    const list = el('ul', { class: 'issue-list' },
      serious.slice(0, 12).map((i) => {
        const n = project.pages.findIndex((p) => p.id === i.pageId) + 1;
        return el('li', { class: i.level }, el('button', { class: 'linklike', onclick: () => { document.querySelector('.modal-backdrop .btn')?.click(); onShowIssue?.(i); } }, `${n}ページ：`), i.message);
      }));
    const body = el('div', {},
      serious.length ? el('p', {}, '印刷の前に確認してください。') : null,
      serious.length ? list : null,
      serious.length > 12 ? el('p', { class: 'muted' }, `ほか${serious.length - 12}件`) : null,
      emptyFrames ? el('p', { class: 'muted' }, `写真が入っていない写真枠が${emptyFrames}か所あります（印刷では空白）。`) : null,
      hasUnderlay ? el('p', { class: 'muted' }, '下敷きは印刷されません。') : null,
    );
    const go = await dialog({
      title: '印刷前のチェック',
      body,
      wide: true,
      buttons: [{ label: '戻って直す', value: false }, { label: 'このまま印刷する', value: true, primary: true }],
    });
    if (!go) return false;
  }
  setPageRule(project);
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    root.replaceChildren();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // レイアウトを確定させてから印刷
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.print();
  return true;
}
