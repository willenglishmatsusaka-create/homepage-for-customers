// 最初から使えるテンプレート

import {
  newProject, newPage, newText, newLine, newMenuList, newPhotoFrame, newShape, newCategory, newDish, textStyle,
} from './model.js';

function sampleMenu() {
  const c = {
    starter: newCategory('前菜'),
    main: newCategory('メイン'),
    dessert: newCategory('デザート'),
    drink: newCategory('ドリンク'),
  };
  const dishes = [
    newDish({ categoryId: c.starter.id, name: '季節野菜のテリーヌ', description: '京野菜を重ね、香草のソースで', price: '1800' }),
    newDish({ categoryId: c.starter.id, name: '鮮魚のカルパッチョ', description: '柑橘とオリーブオイル', price: '2200', badges: ['おすすめ'] }),
    newDish({ categoryId: c.main.id, name: '銘柄和牛のステーキ', description: 'かまどの炭火で焼き上げます', price: '時価', badges: ['シェフのおすすめ'] }),
    newDish({ categoryId: c.main.id, name: '鴨胸肉のロースト', description: '赤ワインとカシスのソース', price: '3800' }),
    newDish({ categoryId: c.main.id, name: 'かまど炊きのご飯と香の物', description: '', price: '600' }),
    newDish({ categoryId: c.dessert.id, name: '季節のフルーツタルト', description: '', price: '1200', badges: ['季節限定'] }),
    newDish({ categoryId: c.dessert.id, name: 'ショコラのムース', description: '', price: '1000' }),
    newDish({ categoryId: c.drink.id, name: 'グラスワイン（赤・白）', description: '', price: '1200' }),
    newDish({ categoryId: c.drink.id, name: 'ノンアルコールカクテル', description: '', price: '900' }),
  ];
  return { categories: Object.values(c), dishes, c };
}

function simple() {
  const { categories, dishes } = sampleMenu();
  const page = newPage();
  page.elements.push(
    newText({ name: '店名', text: 'MENU', x: 20, y: 18, w: 170, h: 16, style: textStyle({ font: 'cormorant', size: 30, align: 'center', letterSpacing: 0.3, lineHeight: 1.2 }) }),
    newText({ name: '店名（小）', text: 'BIEN MANGER', x: 20, y: 34, w: 170, h: 8, style: textStyle({ font: 'cormorant', size: 11, align: 'center', letterSpacing: 0.4, color: '#7a756d' }) }),
    newLine({ x: 85, y: 44, w: 40 }),
    newMenuList({ x: 30, y: 54, w: 150, h: 215 }),
    newText({ name: '注意書き', text: '表示価格は税込です。アレルギーのある方はお申し付けください。', x: 20, y: 274, w: 170, h: 8, style: textStyle({ font: 'notosans', size: 7.5, align: 'center', color: '#7a756d' }) }),
  );
  return newProject({ name: 'シンプルなメニュー', categories, dishes, pages: [page] });
}

function withPhotos() {
  const { categories, dishes } = sampleMenu();
  const page = newPage({ background: { ...newPage().background, color: '#faf8f4' } });
  page.elements.push(
    newPhotoFrame({ name: 'メイン写真', x: 0, y: 0, w: 210, h: 82 }),
    newText({ name: '見出し', text: 'MENU', x: 20, y: 88, w: 170, h: 14, style: textStyle({ font: 'cormorant', size: 26, align: 'center', letterSpacing: 0.3, lineHeight: 1.2 }) }),
    newLine({ x: 85, y: 102, w: 40 }),
    newMenuList({
      x: 18, y: 108, w: 174, h: 172,
      layout: { columns: 2, columnGap: 10, showPhotos: true, photoSize: 18, itemGap: 3 },
      styles: { name: { size: 10 }, price: { size: 10 }, desc: { size: 7.5 }, category: { size: 12.5 } },
    }),
    newText({ name: '注意書き', text: '表示価格は税込です。', x: 20, y: 284, w: 170, h: 6, style: textStyle({ font: 'notosans', size: 7, align: 'center', color: '#7a756d' }) }),
  );
  return newProject({ name: '料理写真付きメニュー', categories, dishes, pages: [page] });
}

function seasonal() {
  const season = newCategory('秋のおすすめ');
  const dishes = [
    newDish({ categoryId: season.id, name: '松茸と銘柄和牛のロースト', description: '香りを閉じ込めて、かまどの炭火で仕上げます', price: '時価', badges: ['季節限定'] }),
    newDish({ categoryId: season.id, name: '栗のポタージュ', description: '丹波栗をなめらかに', price: '1400', badges: ['季節限定'] }),
    newDish({ categoryId: season.id, name: '秋鮭と茸のパイ包み', description: 'ブールブランソース', price: '2800' }),
    newDish({ categoryId: season.id, name: '洋梨のコンポートとジェラート', description: '', price: '1100' }),
  ];
  const lead = dishes[0];
  const page = newPage({ background: { ...newPage().background, color: '#f6f1e7' } });
  page.elements.push(
    newShape({ name: '枠線', x: 8, y: 8, w: 194, h: 281, fill: '', strokeWidth: 0.5, stroke: '#8f6334', locked: true }),
    newText({ name: '見出し', text: '秋のおすすめ', x: 20, y: 20, w: 170, h: 16, style: textStyle({ font: 'shippori', size: 24, align: 'center', letterSpacing: 0.3, color: '#5b3a1e' }) }),
    newText({ name: '見出し（欧文）', text: 'Autumn Specials', x: 20, y: 36, w: 170, h: 8, style: textStyle({ font: 'cormorant', size: 12, italic: true, align: 'center', color: '#8f6334' }) }),
    newPhotoFrame({ name: '一押しの写真', x: 30, y: 50, w: 150, h: 100, shape: 'rounded', radius: 4, binding: { dishId: lead.id, field: 'photo' } }),
    newText({ x: 30, y: 155, w: 150, h: 10, text: '', binding: { dishId: lead.id, field: 'name' }, style: textStyle({ size: 16, align: 'center', color: '#3b2a1a' }) }),
    newText({ x: 30, y: 166, w: 150, h: 8, text: '', binding: { dishId: lead.id, field: 'description' }, style: textStyle({ size: 9, align: 'center', color: '#6a5a48' }) }),
    newText({ x: 30, y: 175, w: 150, h: 9, text: '', binding: { dishId: lead.id, field: 'price' }, style: textStyle({ size: 13, align: 'center', color: '#7f2a37' }) }),
    newLine({ x: 70, y: 189, w: 70, stroke: '#8f6334' }),
    newMenuList({
      x: 35, y: 196, w: 140, h: 76,
      categoryIds: [season.id],
      excludeDishIds: [lead.id],
      layout: { showCategory: false, itemGap: 4 },
    }),
  );
  return newProject({ name: '季節のおすすめ（1枚）', categories: [season], dishes, pages: [page] });
}

function blank() {
  return newProject({ name: '白紙のメニュー' });
}

export const TEMPLATES = [
  { key: 'simple', label: '写真なしのシンプルなメニュー', desc: 'カテゴリーごとに料理名・説明・価格を並べます。', make: simple },
  { key: 'photo', label: '料理写真付きのメニュー', desc: '上部のメイン写真と、写真付きの料理リスト（2段組）。', make: withPhotos },
  { key: 'seasonal', label: '季節のおすすめ用の1枚メニュー', desc: '一押しの料理を大きく、ほかの料理を下に。', make: seasonal },
  { key: 'blank', label: '白紙から作る', desc: '何も置かれていないA4のページ。', make: blank },
];
