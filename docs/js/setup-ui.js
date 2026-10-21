import { state, activeMasters } from './state.js';
import { $, escape, options, toast, busy, confirmAction } from './ui-components.js';
import { localDate, calendarDate } from './time-date.js';
import { textError } from './validation.js';
import { conflicts, mappingErrors, mappingKey } from './master-data.js';
let editingId = null;
const labels = { stockpile: 'Stockpile', pileId: 'Pile ID', sourceCode: 'Source Code', productCode: 'Product Code', dome: 'Dome', destination: 'Destination (pilihan lokal)', value: 'Nama / kode' };
export function renderMasterFields(master = null) {
  const kind = $('#master-kind').value;
  const fields = kind === 'stock' ? ['stockpile', 'pileId', 'sourceCode'] : kind === 'product' ? ['productCode', 'dome', 'destination'] : ['value'];
  $('#master-fields').innerHTML = fields.map(k => `<label>${labels[k]}<input name="${k}" value="${escape(master?.[k] || '')}" maxlength="100" required ${k === 'destination' ? 'list="destination-options"' : ''}></label>`).join('');
  $('#cancel-master').hidden = !editingId;
  $('#save-master').textContent = editingId ? 'Simpan koreksi pilihan' : 'Simpan pilihan lokal';
}
export function renderSetup({ fillSession = false } = {}) {
  const sessionForm = $('#session-form');
  const shift = sessionForm.elements.shift;
  shift.innerHTML = options(activeMasters('shift').map(m => m.value), fillSession ? state.session?.shift : shift.value, 'Pilih shift');
  if (fillSession) {
    for (const k of ['operationDate', 'scale', 'checker']) sessionForm.elements[k].value = state.session?.[k] || (k === 'operationDate' ? localDate() : '');
  }
  $('#session-state').textContent = state.session ? 'Aktif' : 'Belum aktif';
  $('#session-summary').textContent = state.session ? `${state.session.operationDate} · ${state.session.shift} · ${state.session.scale} · ${state.session.checker}` : 'Belum ada sesi aktif. Lengkapi Setup untuk mulai mencatat.';
  const list = state.masters.filter(m => m.active !== false);
  $('#master-count').textContent = `(${list.length})`;
  $('#master-list').innerHTML = list.map(m => {
    const label = m.kind === 'stock' ? `${m.stockpile} / ${m.pileId} · source ${m.sourceCode}` : m.kind === 'product' ? `${m.productCode} / ${m.dome} → ${m.destination}` : `${m.kind}: ${m.value}`;
    const conflict = conflicts(m, list).length;
    return `<div class="master-item"><div>${escape(label)}<br><small class="${conflict ? 'text-danger' : 'muted'}">${conflict ? '⚠ Mapping bertentangan — tinjau / nonaktifkan pilihan lama' : m.origin === 'handover' ? 'Dari handover disahkan' : 'Pilihan lokal'}</small></div><div class="actions"><button class="button-quiet" data-edit-master="${escape(m.id)}">Koreksi</button><button class="button-quiet text-danger" data-disable-master="${escape(m.id)}">Nonaktifkan</button></div></div>`;
  }).join('') || '<p class="empty">Belum ada pilihan lokal.</p>';
  const lists = {
    scale: activeMasters('scale').map(m => m.value), checker: activeMasters('checker').map(m => m.value),
    dt: state.records.filter(r => r.origin === 'local').map(r => r.dtNo),
    stock: activeMasters('stock').map(m => m.stockpile), pile: activeMasters('stock').map(m => m.pileId), source: activeMasters('stock').map(m => m.sourceCode),
    product: activeMasters('product').map(m => m.productCode), dome: activeMasters('product').map(m => m.dome),
    destination: [...(state.cache?.values || []).map(d => d.destination_name), ...activeMasters('product').map(m => m.destination)]
  };
  for (const [key, values] of Object.entries(lists)) $('#' + key + '-options').innerHTML = [...new Set(values)].sort().map(v => `<option value="${escape(v)}"></option>`).join('');
}
export function initSetup(ctx) {
  renderMasterFields();
  $('#master-kind').onchange = () => { editingId = null; renderMasterFields(); };
  $('#cancel-master').onclick = () => { editingId = null; renderMasterFields(); };
  $('#session-form').onsubmit = e => { e.preventDefault(); busy($('button', e.currentTarget), async () => {
    try {
      const data = Object.fromEntries(new FormData(e.target)); calendarDate(data.operationDate);
      for (const k of ['shift', 'scale', 'checker']) { const error = textError(data[k], k); if (error) throw Error(error); }
      if (state.draft?.dirty && !await confirmAction('Ubah sesi aktif?', 'Form yang sedang terbuka tetap memakai sesi saat form dibuat. Simpan atau mulai form baru untuk memakai sesi baru.', 'Aktifkan sesi baru')) return;
      await ctx.db.saveSession(data); await ctx.changed(); ctx.applySessionFilter(); ctx.ensureDraft();
      toast('Sesi aktif disimpan di perangkat.');
    } catch (error) { ctx.fail(error); }
  }); };
  $('#master-form').onsubmit = e => { e.preventDefault(); busy($('#save-master'), async () => {
    try {
      const m = { ...Object.fromEntries(new FormData(e.target)), ...(editingId ? { id: editingId } : {}) };
      const errors = mappingErrors(m); if (errors.length) throw Error(errors.join(' '));
      if (['stock', 'product'].includes(m.kind)) m.key = mappingKey(m);
      const duplicate = state.masters.find(x => x.active !== false && x.id !== m.id && x.kind === m.kind && (m.key ? x.key === m.key : x.value === m.value));
      if (duplicate) throw Error('Pilihan identik sudah tersimpan.');
      if (conflicts(m, state.masters).length && !await confirmAction('Mapping bertentangan', 'Mapping baru bertentangan dengan pilihan aktif. Keduanya akan ditandai; nonaktifkan atau koreksi pasangan yang salah setelah meninjau. Tidak ada pasangan ditimpa otomatis.', 'Simpan dengan penanda')) return;
      await ctx.db.saveMaster(m); editingId = null; renderMasterFields(); await ctx.changed(); toast('Pilihan lokal tersimpan.');
    } catch (error) { ctx.fail(error); }
  }); };
  $('#master-list').onclick = async e => {
    const edit = e.target.closest('[data-edit-master]'), disable = e.target.closest('[data-disable-master]');
    const m = state.masters.find(m => m.id === (edit?.dataset.editMaster || disable?.dataset.disableMaster)); if (!m) return;
    if (edit) { editingId = m.id; $('#master-kind').value = m.kind; renderMasterFields(m); $('#master-form').scrollIntoView({ block: 'center' }); $('#master-fields input').focus(); }
    if (disable && await confirmAction('Nonaktifkan pilihan?', 'Pilihan tidak lagi ditawarkan untuk input baru. Snapshot transaksi lama tetap tersimpan.', 'Nonaktifkan')) {
      try { await ctx.db.saveMaster({ ...m, active: false }); await ctx.changed(); } catch (error) { ctx.fail(error); }
    }
  };
}
