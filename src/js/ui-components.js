export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function options(values, selected = '', empty = 'Semua') {
  const list = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (selected && !list.includes(selected)) list.push(selected);
  return `<option value="">${escape(empty)}</option>` + list.map(v => `<option ${v === selected ? 'selected' : ''} value="${escape(v)}">${escape(v)}</option>`).join('');
}
let toastTimer;
export function toast(message, error = false) {
  const el = $('#toast'); clearTimeout(toastTimer); el.textContent = message; el.classList.toggle('error', error); el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 10000 : 4500);
}
export function confirmAction(title, message, action = 'Lanjutkan') {
  return new Promise(resolve => {
    const dialog = $('#confirm-dialog');
    $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; $('#confirm-ok').textContent = action;
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal(); $('button[value="cancel"]', dialog).focus();
  });
}
export async function busy(button, action) {
  if (button.disabled) return;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  const text = button.textContent; button.textContent = 'Memproses…';
  try { return await action(); } finally { button.disabled = false; button.removeAttribute('aria-busy'); if (button.textContent === 'Memproses…') button.textContent = text; }
}
export function download(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const displayStamp = stamp => stamp ? new Date(stamp).toLocaleString('id-ID') : 'Belum pernah';
