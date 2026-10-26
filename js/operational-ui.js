import { state, activeMasters, uid, clone, now } from './state.js';
import { $, escape, toast, busy, confirmAction, displayStamp } from './ui-components.js';
import { localTimeSeconds, localDate, draftTimeMode, timePrecision, normalizeManualTime } from './time-date.js';
import { assertRecord, normalizeDT } from './validation.js';
import { potentialDuplicates } from './wa-exporter.js';
import { stockPairs, resolveProduct } from './master-data.js';
import { initStockPopup, renderStockButton } from './stock-ui.js';
let clockTimer;
let context, queue = Promise.resolve(), draftFailed = false, draftWrites = 0, saving = false, expanded = false, correction = null, correcting = false;
const fields = ['dtNo', 'stockpile', 'pileId', 'sourceCode', 'productCode', 'dome', 'destination', 'time', 'note'];
const values = form => Object.fromEntries(fields.map(k => [k, form.elements[k].value]));
export async function flushDraft() { await queue; if (draftFailed) throw Error('Draft belum tersimpan. Coba input lagi; jangan refresh sebelum draft tersimpan.'); }
export async function prepareSessionEnd() {
  if (saving || correcting || state.sessionTransition) throw Error('Penyimpanan, koreksi, atau handover sedang berlangsung. Tunggu sampai selesai.');
  state.sessionTransition = true;
  renderEntryContext();
  // Drain even failed autosaves: discarding an unsaved draft is explicitly confirmed.
  await queue;
}
export function finishSessionEnd(committed = false) {
  if (committed) {
    state.session = null; state.draft = null; draftFailed = false; expanded = false;
    $('#history-search').value = '';
    $('#destination-form').reset();
    $('#toast').hidden = true;
    $('#correction-dialog').close(); correction = null;
    $('#correction-form').reset();
    $('#audit-dialog').close(); $('#audit-content').replaceChildren();
    $('#checker-dialog').close(); $('#stock-dialog').close();
    for (const details of document.querySelectorAll('main details')) details.open = false;
    fillDraft();
  }
  state.sessionTransition = false;
  renderEntryContext();
}
function persistDraft() {
  if (!state.ready || !state.draft || saving || state.sessionTransition) return queue;
  state.draft.values = values($('#entry-form')); state.draft.dirty = true;
  const value = clone(state.draft); draftWrites++;
  $('#draft-state').textContent = 'Menyimpan draft…';
  queue = queue.catch(() => {}).then(() => context.db.saveDraft(value)).then(() => { draftFailed = false; }).catch(error => {
    draftFailed = true; $('#draft-state').textContent = 'Draft gagal disimpan: ' + error.message; context.fail(error);
  }).finally(() => { draftWrites--; if (!draftWrites && !draftFailed) $('#draft-state').textContent = 'Draft tersimpan di perangkat.'; });
  return queue;
}
export function ensureDraft(force = false) {
  if (!state.session || !state.ready || state.sessionTransition) { renderEntryContext(); return; }
  if (!state.draft || force || (!state.draft.dirty && !state.draft.editId)) {
    const date = new Date(), time = localTimeSeconds(date);
    state.draft = { id: uid(), recordId: uid(), session: clone(state.session), sourceTime: time, clockDate: localDate(date), timeMode: 'auto', openedAt: now(), values: Object.fromEntries(fields.map(k => [k, k === 'time' ? time : ''])), dirty: false };
    fillDraft();
  }
  renderEntryContext();
}
// One display-only timer; never persist or re-render other fields on a tick.
function tickClock() {
  if (!state.ready || !state.draft || saving || state.sessionTransition || draftTimeMode(state.draft) !== 'auto') return;
  $('#entry-form').elements.time.value = localTimeSeconds();
  if (document.activeElement === $('#entry-form').elements.time) $('#entry-form').elements.time.select();
}
function initTimeInput(form, live = false) {
  const input = form.elements.time;
  const isAuto = () => live && state.draft && draftTimeMode(state.draft) === 'auto';
  const selectAuto = () => { if (isAuto()) input.select(); };
  // Selection is repeated after pointer placement and immediately before edits/paste.
  // Do not cancel native editing: Android/IME may send non-cancelable beforeinput.
  input.addEventListener('focus', selectAuto);
  input.addEventListener('click', selectAuto);
  input.addEventListener('pointerup', selectAuto);
  input.addEventListener('beforeinput', selectAuto);
  input.addEventListener('paste', selectAuto);
  input.addEventListener('compositionstart', selectAuto);
  input.addEventListener('input', event => {
    // Fallback for keyboards that replace selection before sending beforeinput.
    if (isAuto() && event.inputType === 'insertText' && event.data != null && !event.isComposing) input.value = event.data;
  });
  input.addEventListener('blur', () => {
    if (isAuto()) return;
    const normalized = normalizeManualTime(input.value);
    if (normalized && normalized !== input.value) {
      input.value = normalized;
      if (live) persistDraft();
    }
  });
}
function populateMappings(form, original = null) {
  for (const kind of ['stock', 'product']) {
    const keys = kind === 'stock' ? ['stockpile', 'pileId'] : ['productCode', 'dome', 'destination'];
    const select = form.querySelector(`[data-mapping="${kind}"]`);
    if (kind === 'stock' && form.id === 'entry-form') { renderStockButton(); continue; }
    const list = kind === 'stock' ? stockPairs(state.masters) : activeMasters(kind).filter(m => resolveProduct(m.dome,m.destination,state.masters)?.productCode === m.productCode);
    if (original && !list.some(m => keys.every(k => m[k] === original[k]))) list.push({ ...original, id: 'original' });
    if (kind === 'product' && form.elements.dome.value && !list.some(m => keys.every(k => m[k] === form.elements[k].value))) list.push({id:'incomplete',...Object.fromEntries(keys.map(k => [k, form.elements[k].value]))});
    const blocked = activeMasters(kind).length - list.length;
    select.innerHTML = '<option value="">Pilih pasangan yang disahkan…</option>' + (blocked > 0 ? '<option disabled>Mapping bertentangan ditahan — periksa handover / keputusan owner</option>' : '') + list.map(m => `<option value="${escape(m.id)}">${escape(kind === 'stock' ? `${m.stockpile} / ${m.pileId}` : `${m.dome} / ${m.destination}`)}</option>`).join('');
    select.value = list.find(m => keys.every(k => m[k] === form.elements[k].value))?.id || '';
    select.onchange = () => {
      const m = select.value === 'original' ? original : state.masters.find(m => m.id === select.value);
      for (const k of keys) form.elements[k].value = m?.[k] || '';
      if (kind === 'stock') form.elements.sourceCode.value = '';
      if (form.id === 'entry-form') persistDraft();
    };
  }
}
export function fillDraft() {
  const form = $('#entry-form');
  for (const k of fields) form.elements[k].value = state.draft?.values[k] || '';
  if (state.draft) state.draft.timeMode = draftTimeMode(state.draft);
  tickClock();
  populateMappings(form); $('#entry-error').hidden = true;
  $('#draft-state').textContent = state.draft?.dirty ? 'Draft dipulihkan dari perangkat.' : 'Waktu otomatis berjalan; ketik untuk mengubah.';
  renderEntryContext();
}
export function renderEntryContext() {
  $('#no-session').hidden = !!state.session;
  $('#entry-fields').disabled = !state.ready || !state.session || saving || state.sessionTransition;
  const s = state.draft?.session || state.session;
  $('#entry-context').innerHTML = s ? ['operationDate', 'shift', 'scale', 'checker'].map(k => `<span>${escape(s[k] || 'Checker belum diisi')}</span>`).join('') + `<strong>Berikutnya: ${escape(state.session?.nextRitase || 'Perlu handover')}</strong>` : 'Belum ada sesi.';
  $('#source-time').textContent = state.draft ? 'Waktu asal: ' + state.draft.sourceTime : '';
}
export function renderOperational() { populateMappings($('#entry-form')); renderEntryContext(); renderHistory(); }
export function renderHistory() {
  const session = state.session;
  const local = state.records.filter(r => r.origin === 'local' && !r.deletedAt && session && ['operationDate', 'shift', 'scale'].every(k => r[k] === session[k]));
  $('#history-count').textContent = local.length;
  const search = $('#history-search').value.toLowerCase();
  const records = local.filter(r => [r.ritaseNumber, r.dtNo, r.dome, r.destination, r.stockpile, r.pileId].join(' ').toLowerCase().includes(search)).sort((a, b) => (b.ritaseNumber || 0) - (a.ritaseNumber || 0) || b.time.localeCompare(a.time) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  $('#history').innerHTML = records.slice(0, expanded ? records.length : 5).map(r => `<article class="history-item"><div class="history-top"><strong>${escape(r.ritaseNumber ? String(r.ritaseNumber).padStart(3, '0') : '—')} | ${escape(r.dtNo)}</strong><time>${escape(r.time)}</time></div><p>${escape(r.stockpile)} / ${escape(r.pileId)} → ${escape(r.dome)} · ${escape(r.destination)}</p><div class="button-row"><button class="secondary" data-edit="${escape(r.id)}">Koreksi</button><button class="button-quiet" data-audit="${escape(r.id)}">Detail</button></div></article>`).join('') || '<div class="empty">Belum ada ritase sesi aktif sesuai pencarian.</div>';
  $('#more-history').hidden = records.length <= 5;
  $('#more-history').textContent = expanded ? 'Tampilkan Lebih Sedikit' : `Lihat Semua ${records.length} Ritase`;
}
function approvedMappings(data, original = null) {
  for (const [kind, keys] of [['stock', ['stockpile', 'pileId']], ['product', ['productCode', 'dome', 'destination']]]) {
    if (original && keys.every(k => original[k] === data[k])) continue;
    const m = activeMasters(kind).find(m => keys.every(k => m[k] === data[k]));
    if (!m || (kind === 'product' && resolveProduct(data.dome,data.destination,state.masters)?.productCode !== data.productCode)) throw Error('Mapping material belum lengkap atau ambigu. Periksa Product/Dome/Destination dari handover yang disahkan.');
  }
}
async function save(form, original = null, captured = null) {
  const draft = clone(state.draft);
  const data = { ...values(form), ...(original ? Object.fromEntries(['operationDate', 'shift', 'scale', 'checker', 'checkers'].filter(k => original[k] !== undefined).map(k => [k, original[k]])) : draft.session), id: original?.id || draft.recordId };
  if (!original && captured) {
    data.time = captured.time;
    data.openedTime = draft.sourceTime; data.openedDate = draft.clockDate;
  }
  data.timeMode = original ? (data.time === original.time ? original.timeMode : 'manual') : captured.mode;
  data.time = normalizeManualTime(data.time) ?? data.time;
  if (original && data.time === original.time) data.timeMode = original.timeMode;
  if (data.timeMode === undefined) delete data.timeMode;
  data.timePrecision = timePrecision(data.time);
  delete data.savedAt;
  if (draft?.editId && !original) throw Error('Draft koreksi versi lama dipertahankan. Periksa draft sebelum membatalkannya; gunakan popup Koreksi.');
  if (!original) data.sourceCode = '';
  data.dtNo = normalizeDT(data.dtNo, original?.dtNo);
  assertRecord(data); approvedMappings(data, original);
  let duplicateConfirmed = false;
  if (potentialDuplicates(data, await context.db.all('records')).length) {
    duplicateConfirmed = await confirmAction('Potensi ritase duplikat', 'Kolom transaksi sama dengan ritase lain. Simpan hanya jika transaksi berbeda.', 'Simpan transaksi berbeda');
    if (!duplicateConfirmed) return false;
  }
  await context.db.saveRecord(data, { expectedRevision: original?.revision ?? null, draftId: original ? null : draft.id, sourceTime: original?.sourceTime || (captured.mode === 'auto' ? captured.time : draft.sourceTime), clockDate: original ? null : (captured.mode === 'auto' ? captured.date : null), duplicateConfirmed });
  return true;
}
export function initOperational(ctx) {
  context = ctx;
  initStockPopup(ctx, () => { populateMappings($('#entry-form')); return persistDraft(); }, flushDraft);
  clearInterval(clockTimer);
  clockTimer = setInterval(tickClock, 1000);
  document.removeEventListener('visibilitychange', tickClock);
  document.addEventListener('visibilitychange', tickClock);
  initTimeInput($('#entry-form'), true);
  initTimeInput($('#correction-form'));
  $('#entry-form').oninput = event => {
    if (event.target.name === 'time' && state.draft) {
      state.draft.timeMode = event.target.value.trim() ? 'manual' : 'auto';
      tickClock();
    }
    persistDraft();
  };
  $('#entry-form').onsubmit = e => { e.preventDefault();
    // Entry uses novalidate so capture precedes all application validation and awaits.
    const pressed = new Date(), mode = draftTimeMode(state.draft);
    const captured = { mode, time: mode === 'auto' ? localTimeSeconds(pressed) : $('#entry-form').elements.time.value, date: localDate(pressed) };
    busy($('#save-entry'), async () => {
    if (!state.draft || saving || state.sessionTransition) return;
    saving = true; renderEntryContext(); $('#entry-error').hidden = true;
    try {
      await flushDraft(); if (!await save($('#entry-form'), null, captured)) return;
      state.draft = null; draftFailed = false;
      await ctx.changed(); ensureDraft(true);
      toast('Ritase tersimpan di perangkat.'); $('#entry-form').elements.dtNo.focus();
    } catch (error) { $('#entry-error').textContent = error.message; $('#entry-error').hidden = false; toast(error.message, true); }
    finally { saving = false; renderEntryContext(); }
  }).catch(ctx.fail); };
  $('#cancel-draft').onclick = async () => {
    if (saving || state.sessionTransition || !state.draft) return;
    if (state.draft.dirty && !await confirmAction('Batalkan input?', 'Draft yang belum disimpan akan dihapus. Ritase tersimpan tetap tersedia.', 'Batalkan input')) return;
    try { await queue; await ctx.db.transaction(['settings'], 'readwrite', s => s.settings.delete('draft')); state.draft = null; draftFailed = false; ensureDraft(true); } catch (error) { ctx.fail(error); }
  };
  $('#history-search').oninput = () => { expanded = false; renderHistory(); };
  $('#more-history').onclick = () => { expanded = !expanded; renderHistory(); };
  $('#cancel-correction').onclick = () => { if (!correcting) $('#correction-dialog').close(); };
  $('#correction-dialog').addEventListener('cancel', e => { if (correcting) e.preventDefault(); });
  $('#correction-form').onsubmit = e => { e.preventDefault(); if (correcting || state.sessionTransition) return;
    busy($('#correction-form button[type="submit"]'), async () => {
      correcting = true; $('#correction-form fieldset').disabled = true; $('#correction-error').hidden = true;
      try { if (!await save($('#correction-form'), correction)) return; await ctx.changed(); $('#correction-dialog').close(); toast('Koreksi dan perubahan nomor tersimpan atomik.'); }
      catch (error) { $('#correction-error').textContent = error.message; $('#correction-error').hidden = false; }
      finally { correcting = false; $('#correction-form fieldset').disabled = false; }
    }).catch(ctx.fail);
  };
  $('#history').onclick = async e => {
    const button = e.target.closest('button'); if (!button || saving) return;
    const id = button.dataset.edit || button.dataset.audit;
    try {
      const r = await ctx.db.get('records', id); if (!r || r.deletedAt) throw Error('Transaksi tidak tersedia. Muat ulang riwayat.');
      if (button.dataset.edit) {
        correction = clone(r);
        for (const k of fields) $('#correction-form').elements[k].value = r[k] || '';
        populateMappings($('#correction-form'), r); $('#correction-error').hidden = true;
        $('#correction-title').textContent = `Koreksi ${r.ritaseNumber ? String(r.ritaseNumber).padStart(3, '0') : r.dtNo}`;
        $('#correction-dialog').showModal(); $('#correction-form').elements.dtNo.focus();
      }
      if (button.dataset.audit) {
        const log = (await ctx.db.all('audit')).filter(a => a.recordId === id).sort((a, b) => a.at.localeCompare(b.at));
        $('#audit-content').innerHTML = `<p>ID: ${escape(r.id)}<br>Waktu asal: ${escape(r.sourceTime)} · terakhir: ${escape(r.editedTime)}<br>Dibuat: ${escape(displayStamp(r.createdAt))}</p><h3>Snapshot asli</h3><pre>${escape(JSON.stringify(r.sourceSnapshot, null, 2))}</pre>` + log.map(a => `<details><summary>${escape(a.action)} · ${escape(displayStamp(a.at))}</summary><pre>${escape(JSON.stringify(a, null, 2))}</pre></details>`).join('');
        $('#audit-dialog').showModal();
      }
    } catch (error) { ctx.fail(error); }
  };
  window.addEventListener('beforeunload', e => { if (draftFailed || draftWrites || saving || correcting) { e.preventDefault(); e.returnValue = ''; } });
}
