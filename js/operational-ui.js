import { state, activeMasters, uid, clone, now } from './state.js';
import { $, escape, toast, busy, confirmAction, displayStamp } from './ui-components.js';
import { localTime } from './time-date.js';
import { assertRecord } from './validation.js';
import { potentialDuplicates } from './wa-exporter.js';
import { conflicts } from './master-data.js';
let context, queue = Promise.resolve(), draftFailed = false, draftWrites = 0, saving = false, historyLimit = 30;
const fields = ['dtNo', 'stockpile', 'pileId', 'sourceCode', 'productCode', 'dome', 'destination', 'time', 'note'];
function entryValues() { return Object.fromEntries(fields.map(k => [k, $('#entry-form').elements[k].value])); }
export async function flushDraft() { await queue; if (draftFailed) throw Error('Draft belum tersimpan. Coba input lagi atau unduh backup sebelum refresh.'); }
function persistDraft() {
  if (!state.ready || !state.draft || saving) return queue;
  state.draft.values = entryValues(); state.draft.dirty = true;
  const value = clone(state.draft);
  draftWrites++;
  $('#draft-state').textContent = 'Menyimpan draft…';
  queue = queue.catch(() => {}).then(() => context.db.put('settings', { id: 'draft', value })).then(() => {
    draftFailed = false;
  }).catch(error => { draftFailed = true; $('#draft-state').textContent = 'Draft gagal disimpan: ' + error.message; context.fail(error); }).finally(() => {
    draftWrites--;
    if (!draftWrites && !draftFailed) $('#draft-state').textContent = 'Draft tersimpan di perangkat.';
  });
  return queue;
}
export function ensureDraft(force = false) {
  if (!state.session || !state.ready) { renderEntryContext(); return; }
  if (!state.draft || force || (!state.draft.dirty && !state.draft.editId)) {
    const time = localTime();
    state.draft = { id: uid(), recordId: uid(), session: clone(state.session), sourceTime: time, openedAt: now(), values: Object.fromEntries(fields.map(k => [k, k === 'time' ? time : ''])), dirty: false };
    fillDraft();
  }
  renderEntryContext();
}
export function fillDraft() {
  const form = $('#entry-form');
  for (const k of fields) form.elements[k].value = state.draft?.values[k] || '';
  $('#entry-title').textContent = state.draft?.editId ? 'Koreksi ritase' : 'Ritase baru';
  $('#save-entry').textContent = state.draft?.editId ? 'Simpan koreksi' : 'Simpan ritase';
  $('#entry-error').hidden = true; $('#stock-quick').value = ''; $('#product-quick').value = '';
  $('#draft-state').textContent = state.draft?.dirty ? 'Draft dipulihkan dari perangkat.' : 'Form baru — waktu mengikuti jam perangkat saat dibuka.';
  renderEntryContext();
}
export function renderEntryContext() {
  $('#no-session').hidden = !!state.session;
  $('#entry-fields').disabled = !state.ready || !state.session || saving;
  const s = state.draft?.session || state.session;
  $('#entry-context').innerHTML = s ? ['operationDate', 'shift', 'scale', 'checker'].map(k => `<span>${escape(s[k])}</span>`).join('') : 'Belum ada sesi.';
  $('#source-time').textContent = state.draft ? 'Waktu asal: ' + state.draft.sourceTime : '';
}
export function renderOperational() {
  for (const [kind, selector] of [['stock', '#stock-quick'], ['product', '#product-quick']]) {
    const el = $(selector), previous = el.value;
    el.innerHTML = '<option value="">Pilih pasangan tersimpan…</option>' + activeMasters(kind).map(m => {
      const label = kind === 'stock' ? `${m.stockpile} / ${m.pileId} · ${m.sourceCode}` : `${m.productCode} / ${m.dome} → ${m.destination}`;
      return `<option value="${escape(m.id)}">${conflicts(m, state.masters).length ? '⚠ ' : ''}${escape(label)}</option>`;
    }).join('');
    el.value = previous;
  }
  renderEntryContext(); renderHistory();
}
export function renderHistory() {
  const local = state.records.filter(r => r.origin === 'local' && !r.deletedAt);
  $('#history-count').textContent = local.length;
  const search = $('#history-search').value.toLowerCase();
  const records = local.filter(r => [r.dtNo, r.operationDate, r.shift, r.scale, r.checker, r.dome, r.destination, r.stockpile].join(' ').toLowerCase().includes(search)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  $('#history').innerHTML = records.slice(0, historyLimit).map(r => `<article class="history-item"><div class="history-top"><strong>${escape(r.dtNo)}</strong><time>${escape(r.time)}</time></div><p>${escape(r.stockpile)} / ${escape(r.pileId)} → ${escape(r.dome)}</p><p>${escape(r.destination)}</p><p class="hint">${escape(r.operationDate)} · ${escape(r.shift)} · ${escape(r.scale)} · ${escape(r.checker)}${r.revision > 1 ? ' · dikoreksi' : ''}</p>${r.note ? `<p>Note: ${escape(r.note)}</p>` : ''}<div class="button-row"><button class="secondary" data-edit="${escape(r.id)}">Koreksi</button><button class="button-quiet" data-audit="${escape(r.id)}">Jejak data</button><button class="button-quiet text-danger" data-delete="${escape(r.id)}">Hapus</button></div></article>`).join('') || '<div class="empty">Belum ada input lokal sesuai pencarian.</div>';
  $('#more-history').hidden = records.length <= historyLimit;
}
function approvedMappings(data) {
  const original = state.records.find(r => r.id === state.draft?.editId);
  const stockKeys = ['stockpile', 'pileId', 'sourceCode'], productKeys = ['productCode', 'dome'];
  const stock = activeMasters('stock').find(m => stockKeys.every(k => m[k] === data[k]));
  const product = activeMasters('product').find(m => productKeys.every(k => m[k] === data[k]));
  const originalStock = original && stockKeys.every(k => original[k] === data[k]);
  const originalProduct = original && productKeys.every(k => original[k] === data[k]);
  if (!stock && !originalStock) throw Error('Pasangan Stockpile / Pile / Source Code belum disahkan. Simpan pilihan lokal atau impor handover di Setup.');
  if (!product && !originalProduct) throw Error('Pasangan Product / Dome belum disahkan. Periksa pilihan lokal di Setup.');
  const destinations = [...(state.cache?.values || []).map(d => d.destination_name), ...activeMasters('product').map(m => m.destination), original?.destination];
  if (!destinations.includes(data.destination)) throw Error('Destination belum ada di cache atau pilihan handover/lokal. Tambahkan secara eksplisit di Setup.');
  return (stock && conflicts(stock, state.masters).length) || (product && conflicts(product, state.masters).length);
}
export function initOperational(ctx) {
  context = ctx;
  $('#entry-form').oninput = () => persistDraft();
  for (const [selector, keys] of [['#stock-quick', ['stockpile', 'pileId', 'sourceCode']], ['#product-quick', ['productCode', 'dome', 'destination']]]) $(selector).onchange = () => {
    const m = state.masters.find(m => m.id === $(selector).value); if (!m) return;
    for (const k of keys) $('#entry-form').elements[k].value = m[k]; persistDraft();
  };
  $('#new-entry').onclick = async () => {
    if (saving) return;
    if (state.draft?.dirty && !await confirmAction('Mulai form baru?', 'Draft yang belum menjadi ritase akan diganti. Input yang sudah tersimpan tetap ada.', 'Form baru')) return;
    try {
      await queue; await ctx.db.transaction(['settings'], 'readwrite', s => s.settings.delete('draft'));
      ensureDraft(true); $('#entry-form').elements.dtNo.focus();
    } catch (error) { ctx.fail(error); }
  };
  $('#entry-form').onsubmit = e => { e.preventDefault(); busy($('#save-entry'), async () => {
    if (!state.draft || saving) return;
    saving = true; $('#entry-fields').disabled = true; $('#entry-error').hidden = true;
    try {
      await flushDraft();
      const draft = clone(state.draft);
      const data = { ...entryValues(), ...draft.session, id: draft.editId || draft.recordId };
      delete data.savedAt;
      assertRecord(data);
      const ambiguous = approvedMappings(data);
      let mappingConfirmed = false, duplicateConfirmed = false;
      if (ambiguous) { mappingConfirmed = await confirmAction('Mapping bertentangan', 'Pasangan terpilih masih bertentangan dengan master lain. Pastikan Source Code dan Product Code sudah benar.', 'Gunakan pasangan ini'); if (!mappingConfirmed) return; }
      const fresh = await ctx.db.all('records');
      if (potentialDuplicates(data, fresh).length) { duplicateConfirmed = await confirmAction('Potensi ritase duplikat', 'Semua 11 kolom sama dengan transaksi lain. Ritase identik bisa valid. Simpan hanya jika ini benar-benar transaksi berbeda.', 'Simpan transaksi berbeda'); if (!duplicateConfirmed) return; }
      if (draft.editId && !await confirmAction('Simpan koreksi?', 'Snapshot asli dan seluruh perubahan tetap disimpan dalam jejak data.', 'Simpan koreksi')) return;
      // Freeze input through the transaction to prevent edits racing the saved snapshot.
      $('#entry-fields').disabled = true;
      await ctx.db.saveRecord(data, { expectedRevision: draft.editId ? draft.revision : null, draftId: draft.id, sourceTime: draft.sourceTime, duplicateConfirmed, mappingConfirmed });
      state.draft = null; draftFailed = false;
      await ctx.changed(); ensureDraft(true);
      toast(draft.editId ? 'Koreksi tersimpan beserta jejak perubahan.' : 'Ritase tersimpan di perangkat.');
      $('#entry-form').elements.dtNo.focus();
    } catch (error) { $('#entry-error').textContent = error.message; $('#entry-error').hidden = false; toast(error.message, true); }
    finally { saving = false; renderEntryContext(); }
  }).catch(ctx.fail); };
  $('#history-search').oninput = () => { historyLimit = 30; renderHistory(); };
  $('#more-history').onclick = () => { historyLimit += 30; renderHistory(); };
  $('#history').onclick = async e => {
    const button = e.target.closest('button'); if (!button || saving) return;
    const id = button.dataset.edit || button.dataset.delete || button.dataset.audit;
    try {
      const r = await ctx.db.get('records', id); if (!r || r.deletedAt) throw Error('Transaksi tidak tersedia. Muat ulang riwayat.');
      if (button.dataset.delete) {
        if (!await confirmAction('Hapus ritase?', `${r.dtNo} · ${r.operationDate} · ${r.time}\nTransaksi dikeluarkan dari laporan. Log penghapusan tetap disimpan.`, 'Hapus ritase')) return;
        await ctx.db.deleteRecord(r.id, r.revision); await ctx.changed(); toast('Ritase dihapus dari laporan.');
      }
      if (button.dataset.edit) {
        if (state.draft?.dirty && !await confirmAction('Buka koreksi?', 'Draft saat ini akan diganti dengan transaksi terpilih.', 'Buka koreksi')) return;
        await queue;
        state.draft = { id: uid(), editId: r.id, revision: r.revision, sourceTime: r.sourceTime, session: Object.fromEntries(['operationDate', 'shift', 'scale', 'checker'].map(k => [k, r[k]])), values: Object.fromEntries(fields.map(k => [k, r[k] || ''])), dirty: true };
        fillDraft(); await persistDraft(); $('#entry-form').scrollIntoView({ block: 'start' }); $('#entry-form').elements.dtNo.focus();
      }
      if (button.dataset.audit) {
        const log = (await ctx.db.all('audit')).filter(a => a.recordId === id).sort((a, b) => a.at.localeCompare(b.at));
        $('#audit-content').innerHTML = `<p>ID: ${escape(r.id)}<br>Waktu asal: ${escape(r.sourceTime)} · terakhir: ${escape(r.editedTime)}<br>Dibuat: ${escape(displayStamp(r.createdAt))}</p><h3>Snapshot asli</h3><pre>${escape(JSON.stringify(r.sourceSnapshot, null, 2))}</pre>` + log.map(a => `<details><summary>${escape(a.action)} · ${escape(displayStamp(a.at))}</summary><pre>${escape(JSON.stringify(a, null, 2))}</pre></details>`).join('');
        $('#audit-dialog').showModal();
      }
    } catch (error) { ctx.fail(error); }
  };
  window.addEventListener('beforeunload', e => { if (draftFailed || draftWrites || saving) { e.preventDefault(); e.returnValue = ''; } });
}
