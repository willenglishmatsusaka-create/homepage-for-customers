// ブラウザ内保存（IndexedDB）。画像は Blob のまま保存し、外部には送信しない。

const DB_NAME = 'menu-editor';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const req = fn(s);
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('保存に失敗しました（容量不足の可能性があります）'));
  });
}

export const db = {
  getProject: (id) => tx('projects', 'readonly', (s) => s.get(id)),
  listProjects: () => tx('projects', 'readonly', (s) => s.getAll()),
  putProject: (p) => tx('projects', 'readwrite', (s) => s.put(p)),
  deleteProject: (id) => tx('projects', 'readwrite', (s) => s.delete(id)),

  getAsset: (id) => tx('assets', 'readonly', (s) => s.get(id)),
  listAssets: () => tx('assets', 'readonly', (s) => s.getAll()),
  putAsset: (a) => tx('assets', 'readwrite', (s) => s.put(a)),
  deleteAsset: (id) => tx('assets', 'readwrite', (s) => s.delete(id)),

  getMeta: (key) => tx('meta', 'readonly', (s) => s.get(key)),
  setMeta: (key, value) => tx('meta', 'readwrite', (s) => s.put(value, key)),
};

// 画像の表示用 URL（object URL）をキャッシュ
const urlCache = new Map();
const assetCache = new Map();

export async function loadAllAssets() {
  const list = await db.listAssets();
  for (const a of list) cacheAsset(a);
  return list;
}

export function cacheAsset(a) {
  assetCache.set(a.id, a);
  if (!urlCache.has(a.id)) urlCache.set(a.id, URL.createObjectURL(a.blob));
}

export function forgetAsset(id) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
  assetCache.delete(id);
}

export const assetURL = (id) => (id ? urlCache.get(id) || '' : '');
export const assetInfo = (id) => assetCache.get(id);
export const allAssets = () => [...assetCache.values()].sort((a, b) => b.createdAt - a.createdAt);

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  } catch {
    return false;
  }
}

export async function storageEstimate() {
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
