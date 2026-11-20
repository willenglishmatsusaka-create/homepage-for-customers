// データの形と初期値

import { uid, paperSize } from './util.js';

export const FORMAT_VERSION = 1;

export const FONTS = [
  { key: 'shippori', label: 'しっぽり明朝', css: '"Shippori Mincho", "Yu Mincho", "YuMincho", serif' },
  { key: 'notoserif', label: '源ノ明朝（Noto Serif JP）', css: '"Noto Serif JP", "Yu Mincho", serif' },
  { key: 'zenold', label: 'Zen 明朝（Zen Old Mincho）', css: '"Zen Old Mincho", "Yu Mincho", serif' },
  { key: 'notosans', label: 'ゴシック（Noto Sans JP）', css: '"Noto Sans JP", "Yu Gothic", "YuGothic", sans-serif' },
  { key: 'zenkaku', label: 'Zen 角ゴシック', css: '"Zen Kaku Gothic New", "Yu Gothic", sans-serif' },
  { key: 'zenmaru', label: '丸ゴシック（Zen Maru Gothic）', css: '"Zen Maru Gothic", "Yu Gothic", sans-serif' },
  { key: 'klee', label: '手書き風（Klee One）', css: '"Klee One", "Yu Gothic", cursive' },
  { key: 'cormorant', label: '欧文セリフ（Cormorant Garamond）', css: '"Cormorant Garamond", "Shippori Mincho", serif' },
  { key: 'playfair', label: '欧文（Playfair Display）', css: '"Playfair Display", "Shippori Mincho", serif' },
  { key: 'yumin', label: '游明朝（パソコン標準）', css: '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", serif' },
  { key: 'yugo', label: '游ゴシック（パソコン標準）', css: '"Yu Gothic", "YuGothic", "Hiragino Sans", sans-serif' },
];
export const fontCSS = (key) => (FONTS.find((f) => f.key === key) || FONTS[0]).css;
export const fontFamilyName = (key) => fontCSS(key).split(',')[0].replace(/"/g, '').trim();

export const BADGES = ['おすすめ', '季節限定', '新メニュー', '数量限定', 'シェフのおすすめ'];

export const DISH_FIELDS = [
  { key: 'name', label: '料理名' },
  { key: 'description', label: '説明文' },
  { key: 'price', label: '価格' },
  { key: 'badges', label: '補足表示（おすすめ等）' },
  { key: 'category', label: 'カテゴリー名' },
];

export const textStyle = (over = {}) => ({
  font: 'shippori',
  size: 11, // pt
  color: '#2c2b29',
  lineHeight: 1.6,
  align: 'left',
  valign: 'top',
  bold: false,
  italic: false,
  letterSpacing: 0, // em
  vertical: false,
  ...over,
});

const base = (type, over) => ({
  id: uid('el'),
  type,
  name: '',
  x: 20,
  y: 20,
  w: 60,
  h: 20,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  ...over,
});

export const newText = (over = {}) =>
  base('text', {
    text: 'テキスト',
    binding: null,
    fill: '',
    ...over,
    style: textStyle(over.style),
  });

export const newImage = (over = {}) =>
  base('image', {
    assetId: null,
    role: 'design', // design: ロゴ・イラスト等 / photo: 料理写真の枠
    fit: 'contain',
    shape: 'rect',
    radius: 3,
    crop: { x: 0.5, y: 0.5, zoom: 1 },
    binding: null,
    borderWidth: 0,
    borderColor: '#2c2b29',
    ...over,
  });

export const newPhotoFrame = (over = {}) =>
  newImage({ role: 'photo', fit: 'cover', w: 60, h: 45, name: '写真枠', ...over });

export const newShape = (over = {}) =>
  base('shape', {
    shape: 'rect', // rect | ellipse | line
    fill: '#ffffff',
    stroke: '#2c2b29',
    strokeWidth: 0, // mm
    strokeStyle: 'solid',
    radius: 0,
    ...over,
  });

export const newLine = (over = {}) =>
  newShape({ shape: 'line', h: 4, fill: '', strokeWidth: 0.3, name: '区切り線', ...over });

export const menuStyles = (over = {}) => ({
  category: textStyle({ size: 14, align: 'center', letterSpacing: 0.2, bold: false, ...over.category }),
  name: textStyle({ size: 11, ...over.name }),
  desc: textStyle({ size: 8.5, color: '#5a5650', lineHeight: 1.6, ...over.desc }),
  price: textStyle({ size: 11, align: 'right', ...over.price }),
  badgeColor: over.badgeColor || '#7f2a37',
});

export const newMenuList = (over = {}) =>
  base('menu', {
    name: '料理リスト',
    categoryIds: [], // 空なら全カテゴリー
    excludeDishIds: [], // 別の場所で大きく紹介する料理など、リストに出さない料理
    continueFrom: null, // 前のリストからあふれた料理を続けて表示
    layout: {
      columns: 1,
      columnGap: 8,
      itemGap: 3.5,
      categoryGap: 6,
      showCategory: true,
      showDescription: true,
      showPhotos: false,
      photoSize: 22,
      photoShape: 'rounded',
      leader: true,
      ...over.layout,
    },
    ...over,
    styles: menuStyles(over.styles),
  });

export const newPage = (over = {}) => ({
  id: uid('pg'),
  background: { color: '#ffffff', assetId: null, fit: 'cover', opacity: 1, locked: true },
  underlay: { assetId: null, opacity: 0.5, visible: true },
  elements: [],
  ...over,
});

export const newCategory = (name) => ({ id: uid('cat'), name });

export const newDish = (over = {}) => ({
  id: uid('dish'),
  name: '新しい料理',
  description: '',
  price: '',
  categoryId: null,
  photoAssetId: null,
  showPhoto: true,
  badges: [],
  ...over,
});

export function newProject(over = {}) {
  const now = Date.now();
  return {
    id: uid('menu'),
    version: FORMAT_VERSION,
    name: '新しいメニュー',
    createdAt: now,
    updatedAt: now,
    lastBackupAt: null,
    paper: { size: 'A4', orientation: 'portrait' },
    safeMargin: 5,
    priceFormat: 'yen',
    categories: [],
    dishes: [],
    pages: [newPage()],
    ...over,
  };
}

// 古いデータや取り込んだデータの欠けている項目を補う
export function normalizeProject(p) {
  const d = newProject();
  const out = { ...d, ...p, paper: { ...d.paper, ...p.paper } };
  out.categories = (p.categories || []).map((c) => ({ ...c }));
  out.dishes = (p.dishes || []).map((x) => ({ ...newDish(), ...x, badges: x.badges || [] }));
  out.pages = (p.pages && p.pages.length ? p.pages : [newPage()]).map((pg) => {
    const np = newPage();
    return {
      ...np,
      ...pg,
      background: { ...np.background, ...pg.background },
      underlay: { ...np.underlay, ...pg.underlay },
      elements: (pg.elements || []).map(normalizeElement),
    };
  });
  return out;
}

function normalizeElement(e) {
  if (e.type === 'text') return { ...newText(), ...e, style: textStyle(e.style) };
  if (e.type === 'image') return { ...newImage(), ...e, crop: { x: 0.5, y: 0.5, zoom: 1, ...e.crop } };
  if (e.type === 'shape') return { ...newShape(), ...e };
  if (e.type === 'menu') {
    const m = newMenuList();
    return { ...m, ...e, layout: { ...m.layout, ...e.layout }, styles: menuStyles(e.styles || {}) };
  }
  return e;
}

export const pageSize = (project) => paperSize(project.paper);

export function categoryName(project, id) {
  return project.categories.find((c) => c.id === id)?.name || '未分類';
}

export function elementLabel(e) {
  if (e.name) return e.name;
  if (e.type === 'text') return (e.binding ? '🔗 ' : '') + (e.text || 'テキスト').slice(0, 14);
  if (e.type === 'image') return e.role === 'photo' ? '写真枠' : '画像';
  if (e.type === 'shape') return { rect: '四角形', ellipse: '円', line: '線' }[e.shape] || '図形';
  if (e.type === 'menu') return '料理リスト';
  return e.type;
}

// 参照している画像 ID を集める（書き出し・削除チェック用）
export function referencedAssetIds(project) {
  const ids = new Set();
  for (const d of project.dishes) if (d.photoAssetId) ids.add(d.photoAssetId);
  for (const pg of project.pages) {
    if (pg.background.assetId) ids.add(pg.background.assetId);
    if (pg.underlay.assetId) ids.add(pg.underlay.assetId);
    for (const e of pg.elements) if (e.type === 'image' && e.assetId) ids.add(e.assetId);
  }
  for (const id of project.libraryAssetIds || []) ids.add(id);
  return ids;
}
