// 画像の取り込み（端末内で処理し、外部には送らない）

import { db, cacheAsset } from './db.js';
import { uid, toast } from './util.js';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

function guessType(file) {
  if (IMAGE_TYPES.includes(file.type)) return file.type;
  const ext = file.name?.split('.').pop()?.toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || file.type;
}

export async function imageSize(blob) {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(blob);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return size;
    } catch {
      /* 下の方法で再試行 */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

/**
 * 画像ファイルを素材として保存する。元のファイルをそのまま保存するので、透過PNGの透明部分や画質は保たれる。
 * kind: design（デザイン素材）/ photo（料理写真）/ import（取り込んだ既存メニュー）
 */
export async function addImageFile(file, kind = 'design', name) {
  const type = guessType(file);
  if (!IMAGE_TYPES.includes(type)) {
    throw new Error(`「${file.name}」は対応していない形式です（JPEG・PNG・WebP に対応）`);
  }
  const blob = file.type === type ? file : new Blob([file], { type });
  const { width, height } = await imageSize(blob);
  const asset = { id: uid('img'), name: name || file.name || '画像', type, blob, width, height, kind, createdAt: Date.now() };
  await db.putAsset(asset);
  cacheAsset(asset);
  return asset;
}

export async function addImageFiles(files, kind) {
  const out = [];
  for (const f of files) {
    try {
      out.push(await addImageFile(f, kind));
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return out;
}

export function isImageFile(f) {
  return IMAGE_TYPES.includes(guessType(f));
}

export function isPdfFile(f) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
}
