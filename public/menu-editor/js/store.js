// 編集中のメニューの状態・元に戻す／やり直し・自動保存

import { db } from './db.js';
import { debounce } from './util.js';

const MAX_HISTORY = 100;
const listeners = new Set();

export const state = {
  project: null,
  pageId: null,
  selection: [], // 選択中の要素 ID
  zoom: 1,
  cropMode: null, // トリミング調整中の要素 ID
  saveStatus: 'saved', // saved | pending | error
  savedAt: null,
};

let undoStack = [];
let redoStack = [];
let lastKey = null;
let lastTime = 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(what = 'all') {
  for (const fn of listeners) fn(what);
}

export function loadProject(project) {
  state.project = project;
  state.pageId = project.pages[0]?.id;
  state.selection = [];
  state.cropMode = null;
  undoStack = [];
  redoStack = [];
  lastKey = null;
  emit('all');
}

/**
 * 変更を加える。key を渡すと、同じ key の連続した変更（文字入力など）を1回の「元に戻す」にまとめる。
 */
export function update(mutator, { key = null, render = 'all' } = {}) {
  const now = Date.now();
  if (!(key && key === lastKey && now - lastTime < 1500)) {
    undoStack.push(JSON.stringify(state.project));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }
  lastKey = key;
  lastTime = now;
  redoStack = [];
  mutator(state.project);
  touch();
  emit(render);
}

// 元に戻す用の記録だけ先に取る（ドラッグ開始時など）
export function checkpoint() {
  undoStack.push(JSON.stringify(state.project));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  lastKey = null;
}

// checkpoint 後の変更（記録は増やさない）
export function mutateQuiet(mutator, render = 'canvas') {
  mutator(state.project);
  touch();
  emit(render);
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(JSON.stringify(state.project));
  restore(undoStack.pop());
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(JSON.stringify(state.project));
  restore(redoStack.pop());
  return true;
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function restore(json) {
  const p = JSON.parse(json);
  state.project = p;
  if (!p.pages.some((pg) => pg.id === state.pageId)) state.pageId = p.pages[0].id;
  const ids = new Set(p.pages.flatMap((pg) => pg.elements.map((e) => e.id)));
  state.selection = state.selection.filter((id) => ids.has(id));
  state.cropMode = null;
  lastKey = null;
  touch();
  emit('all');
}

function touch() {
  state.project.updatedAt = Date.now();
  state.saveStatus = 'pending';
  scheduleSave();
}

const scheduleSave = debounce(saveNow, 700);

export async function saveNow() {
  if (!state.project) return;
  try {
    await db.putProject(JSON.parse(JSON.stringify(state.project)));
    state.saveStatus = 'saved';
    state.savedAt = Date.now();
  } catch (err) {
    console.error(err);
    state.saveStatus = 'error';
  }
  emit('status');
}

export function flushSave() {
  scheduleSave.flush();
}

// 便利な参照
export const currentPage = () => state.project?.pages.find((p) => p.id === state.pageId) || state.project?.pages[0];

export function findElement(id) {
  for (const pg of state.project.pages) {
    const e = pg.elements.find((x) => x.id === id);
    if (e) return { page: pg, element: e };
  }
  return null;
}

export const selectedElements = () =>
  state.selection.map((id) => findElement(id)?.element).filter(Boolean);

export function select(ids, { additive = false } = {}) {
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (additive) {
    const set = new Set(state.selection);
    for (const id of list) set.has(id) ? set.delete(id) : set.add(id);
    state.selection = [...set];
  } else {
    state.selection = list;
  }
  if (state.cropMode && !state.selection.includes(state.cropMode)) state.cropMode = null;
  emit('selection');
}
