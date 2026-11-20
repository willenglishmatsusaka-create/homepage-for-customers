// 設定パネル用の入力部品

import { el } from './util.js';

export function section(title, ...children) {
  return el('section', { class: 'panel-section' }, title ? el('h3', {}, title) : null, ...children);
}

export function row(...children) {
  return el('div', { class: 'row' }, ...children);
}

export function numField(label, value, onInput, { step = 0.5, min, max, unit = '', title } = {}) {
  const input = el('input', { type: 'number', class: 'input', value: String(value ?? ''), step: String(step), min: min ?? null, max: max ?? null, title });
  input.addEventListener('input', () => {
    if (input.value === '' || Number.isNaN(input.valueAsNumber)) return;
    onInput(input.valueAsNumber);
  });
  return el('label', { class: 'field num' }, el('span', {}, label), el('span', { class: 'with-unit' }, input, unit ? el('small', {}, unit) : null));
}

export function rangeField(label, value, onInput, { min = 0, max = 1, step = 0.01, format = (v) => v } = {}) {
  const out = el('small', { class: 'range-value' }, format(value));
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => {
    out.textContent = format(input.valueAsNumber);
    onInput(input.valueAsNumber);
  });
  return el('label', { class: 'field range' }, el('span', {}, label, ' ', out), input);
}

export function textField(label, value, onInput, { placeholder = '', multiline = false, rows = 3, hint } = {}) {
  const input = multiline
    ? el('textarea', { class: 'input', rows: String(rows), placeholder })
    : el('input', { type: 'text', class: 'input', placeholder });
  input.value = value ?? '';
  input.addEventListener('input', () => onInput(input.value));
  return el('label', { class: 'field' }, el('span', {}, label), input, hint ? el('small', { class: 'hint' }, hint) : null);
}

export function colorField(label, value, onInput, { allowNone = false } = {}) {
  const input = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff' });
  const none = allowNone ? el('input', { type: 'checkbox', checked: !value }) : null;
  input.addEventListener('input', () => {
    if (none) none.checked = false;
    onInput(input.value);
  });
  none?.addEventListener('change', () => onInput(none.checked ? '' : input.value));
  const children = [input];
  if (none) children.push(el('label', { class: 'check small' }, none, ' なし'));
  if (window.EyeDropper) {
    children.push(el('button', {
      class: 'btn tiny', type: 'button', title: '画面上の色を拾う（スポイト）',
      onclick: async () => {
        try {
          const { sRGBHex } = await new window.EyeDropper().open();
          input.value = sRGBHex;
          if (none) none.checked = false;
          onInput(sRGBHex);
        } catch { /* キャンセル */ }
      },
    }, 'スポイト'));
  }
  return el('div', { class: 'field color' }, el('span', {}, label), el('div', { class: 'row gap' }, ...children));
}

export function selectField(label, value, options, onChange) {
  const sel = el('select', { class: 'input' }, options.map((o) => el('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'field' }, el('span', {}, label), sel);
}

export function checkField(label, checked, onChange, { title } = {}) {
  const cb = el('input', { type: 'checkbox', checked: !!checked });
  cb.addEventListener('change', () => onChange(cb.checked));
  return el('label', { class: 'check', title }, cb, ' ', label);
}

export function segmented(value, options, onChange, { label } = {}) {
  const wrap = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const o of options) {
    wrap.append(el('button', {
      type: 'button',
      class: String(o.value) === String(value) ? 'on' : '',
      title: o.title || o.label,
      onclick: () => {
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        wrap.querySelector(`[data-v="${CSS.escape(String(o.value))}"]`)?.classList.add('on');
        onChange(o.value);
      },
      dataset: { v: String(o.value) },
    }, o.label));
  }
  return label ? el('div', { class: 'field' }, el('span', {}, label), wrap) : wrap;
}

export function buttons(...list) {
  return el('div', { class: 'btn-row' }, list.filter(Boolean).map((b) =>
    el('button', { type: 'button', class: `btn small${b.danger ? ' danger' : ''}${b.primary ? ' primary' : ''}`, onclick: b.onClick, title: b.title, disabled: b.disabled }, b.label)));
}
