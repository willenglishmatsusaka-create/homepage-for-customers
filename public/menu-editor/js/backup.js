// バックアップ（画像を含む編集データ一式）の書き出し・読み込み

import { db, cacheAsset, assetInfo } from './db.js';
import { referencedAssetIds, normalizeProject, FORMAT_VERSION } from './model.js';
import { blobToDataURL, dataURLToBlob, saveFile, safeFileName, todayStamp, uid } from './util.js';

export const BACKUP_EXT = '.menu-backup.json';
const FORMAT = 'restaurant-menu-editor-backup';

async function assetRecords(ids) {
  const out = [];
  for (const id of ids) {
    const a = assetInfo(id) || (await db.getAsset(id));
    if (!a) continue;
    out.push({ id: a.id, name: a.name, type: a.type, width: a.width, height: a.height, kind: a.kind, createdAt: a.createdAt, data: await blobToDataURL(a.blob) });
  }
  return out;
}

export async function exportProjects(projects, filename) {
  const ids = new Set();
  for (const p of projects) for (const id of referencedAssetIds(p)) ids.add(id);
  const payload = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    assets: await assetRecords(ids),
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const name = filename || (projects.length === 1 ? `${safeFileName(projects[0].name)}_${todayStamp()}${BACKUP_EXT}` : `メニュー一式_${todayStamp()}${BACKUP_EXT}`);
  const saved = await saveFile(blob, name, `menu-backup_${todayStamp()}_${Date.now().toString(36).slice(-4)}${BACKUP_EXT}`);
  if (!saved) return null;
  const now = Date.now();
  for (const p of projects) {
    p.lastBackupAt = now;
    await db.putProject(p);
  }
  await db.setMeta('lastBackupAt', now);
  return { name: saved, size: blob.size };
}

/**
 * バックアップファイルを読み込む。同じ ID のメニューが既にある場合は別のメニューとして追加する。
 * 戻り値: 読み込んだメニューの配列
 */
export async function importBackup(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('ファイルを読み込めませんでした。メニュー編集ツールで書き出したバックアップファイル（.menu-backup.json）を選んでください。');
  }
  if (payload?.format !== FORMAT || !Array.isArray(payload.projects)) {
    throw new Error('メニュー編集ツールのバックアップファイルではありません。');
  }
  // 画像：同じ ID が既にあればそのまま使う
  for (const r of payload.assets || []) {
    if (assetInfo(r.id) || (await db.getAsset(r.id))) continue;
    const blob = await dataURLToBlob(r.data);
    const asset = { id: r.id, name: r.name, type: r.type || blob.type, blob, width: r.width, height: r.height, kind: r.kind || 'design', createdAt: r.createdAt || Date.now() };
    await db.putAsset(asset);
    cacheAsset(asset);
  }
  const existing = new Set((await db.listProjects()).map((p) => p.id));
  const imported = [];
  for (const raw of payload.projects) {
    const p = normalizeProject(raw);
    if (existing.has(p.id)) {
      p.id = uid('menu');
      p.name = `${p.name}（読み込み）`;
    }
    p.updatedAt = Date.now();
    await db.putProject(p);
    imported.push(p);
  }
  return imported;
}
