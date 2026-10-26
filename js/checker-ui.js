import { nameKey } from './validation.js';
import { state, uid, now, clone } from './state.js';
import { $, escape, displayStamp } from './ui-components.js';
import { CheckerBridge, checkerName, checkerText, normalizeCheckers, validListVersion } from './checkers.js';
let ctx, bridge, working = false, mode, expected, editing, selected, message = '';
const values = () => state.checkerCache?.values || [];
const choices = () => {
  const rows = [...values()];
  const saved = state.session?.checkers || (state.session?.checker ? [{checker_id:'legacy:' + state.session.checker,name:state.session.checker}] : []);
  for (const row of saved) if (!rows.some(c => c.checker_id === row.checker_id || (!state.session?.checkers && nameKey(c.name) === nameKey(row.name)))) rows.push({...row, retained:true});
  return rows;
};
export function renderCheckers() {
  $('#checker-control').hidden = !state.session;
  $('#choose-checkers').textContent = checkerText(state.session) || 'Pilih Checker…';
  $('#choose-checkers').disabled = !state.ready || working;
  $('#edit-checkers').disabled = !state.ready || working;
  $('#sync-checkers').disabled = !state.ready || working || !navigator.onLine;
  $('#checker-feedback').textContent = `${values().length} nama aktif. ${state.checkerPending ? 'Permintaan Checker belum terverifikasi. Buka Edit Checker untuk memeriksa / retry ID yang sama. ' : ''}${message || 'Snapshot lokal; gunakan Sync List Checker untuk memeriksa server.'} Terakhir: ${displayStamp(state.checkerCache?.syncedAt)}.`;
}
function error(e) { $('#checker-error').hidden = false; $('#checker-error').textContent = e.message; }
function manage() {
  mode = 'manage'; $('#checker-title').textContent = 'Edit Checker'; $('#checker-ok').hidden = true;
  const pending = state.checkerPending;
  $('#checker-body').innerHTML = (pending ? `<div class="alert warning"><strong>Permintaan belum terverifikasi</strong><p>${escape(pending.payload.name || pending.payload.checker_id)}<br>request_id: ${escape(pending.payload.request_id)}</p><div class="button-row"><button id="verify-checker" class="secondary">Cek read-back</button><button id="retry-checker" class="secondary">Kirim ulang ID sama</button></div></div>` : '') + values().map((c,i) => `<div class="master-item"><span>${escape(c.name)}</span><div class="actions"><button ${pending ? 'disabled' : ''} data-edit="${i}" class="secondary">Edit</button><button ${pending ? 'disabled' : ''} data-delete="${i}" class="button-quiet text-danger">Hapus</button></div></div>`).join('') + `<button id="add-checker" class="secondary full" ${pending ? 'disabled' : ''}>Add Checker</button>`;
}
function form(row = null) {
  mode = 'form'; editing = row && clone(row);
  $('#checker-title').textContent = row ? 'Edit Checker' : 'Add Checker';
  $('#checker-body').innerHTML = `<label>Nama Checker<input id="checker-name" maxlength="80" autocomplete="off" value="${escape(row?.name || '')}"></label><p class="hint">Perubahan master memerlukan koneksi dan verifikasi dari server.</p>`;
  $('#checker-ok').hidden = false; $('#checker-name').focus();
}
async function cache(result) { await ctx.db.put('cache',{id:'checkers',values:result.values,listVersion:result.listVersion,syncedAt:now()}); await ctx.changed(); }
async function completeRequest(pending, retry = false) {
  try {
    const result = retry ? await bridge.mutate(pending.payload) : await bridge.verify(pending.payload);
    await ctx.db.finishCheckerRequest(pending,result); await ctx.changed();
    message = 'Perubahan master terverifikasi melalui GET read-back.'; manage();
  } catch(e) {
    if (['VERSION_CONFLICT','DUPLICATE_NAME','INVALID_NAME','REQUEST_ID_REUSE'].includes(e.code)) {
      await ctx.db.finishCheckerRequest(pending); await ctx.changed();
      if (e.code === 'VERSION_CONFLICT') {
        try { await cache(await bridge.list()); } catch { e.message += ' Pembacaan terbaru gagal; cache lama dipertahankan. Sync sebelum mencoba lagi.'; }
      }
      manage();
    }
    throw e;
  }
}
async function run(action) {
  if (working) return;
  working = true; renderCheckers(); $('#checker-error').hidden = true;
  for (const button of $('#checker-dialog').querySelectorAll('button')) button.disabled = true;
  try { await action(); }
  catch(e) { message = e.message; error(e); }
  finally { working = false; for (const button of $('#checker-dialog').querySelectorAll('button')) button.disabled = false; if (mode === 'manage' && $('#checker-dialog').open) manage(); renderCheckers(); }
}
export function initCheckers(context) {
  ctx = context; bridge = new CheckerBridge(window.RKEF_CONFIG.appsScriptUrl);
  const dialog = $('#checker-dialog');
  dialog.addEventListener('cancel',e => { if (working) e.preventDefault(); });
  dialog.addEventListener('close',() => { if (dialog.open) return; $('#checker-body').replaceChildren(); editing = null; selected = null; });
  $('#choose-checkers').onclick = () => {
    if (!state.session || state.sessionTransition || working) return;
    expected = clone(state.session); mode = 'select'; selected = choices();
    const ids = new Set((state.session.checkers || selected.filter(c => c.retained || nameKey(c.name) === nameKey(state.session.checker))).map(c => c.checker_id));
    $('#checker-title').textContent = 'Pilih Checker'; $('#checker-error').hidden = true; $('#checker-ok').hidden = false;
    $('#checker-body').innerHTML = selected.map((c,i) => `<label class="check-label"><input type="checkbox" data-index="${i}" ${ids.has(c.checker_id) ? 'checked' : ''}><span>${escape(c.name)}${c.retained ? ' (pilihan tersimpan; di luar master aktif)' : ''}</span></label>`).join('') || '<p>Cache kosong. Gunakan Sync List Checker saat online.</p>';
    dialog.showModal();
  };
  $('#edit-checkers').onclick = () => { $('#checker-error').hidden = true; manage(); dialog.showModal(); };
  $('#checker-cancel').onclick = () => {
    if (working) return;
    if (mode === 'form' || mode === 'delete') { $('#checker-error').hidden = true; manage(); } else dialog.close();
  };
  $('#checker-body').onclick = e => {
    const button = e.target.closest('button'); if (!button || working) return;
    $('#checker-error').hidden = true;
    if (['verify-checker','retry-checker'].includes(button.id)) {
      run(async () => {
        if (!navigator.onLine) throw Error('Offline. Sambungkan jaringan untuk memeriksa permintaan.');
        const pending = await ctx.db.get('pending','checker');
        if (!pending) { await ctx.changed(); manage(); return; }
        await completeRequest(pending,button.id === 'retry-checker');
      });
      return;
    }
    if (state.checkerPending) return;
    if (button.id === 'add-checker') form();
    else if (button.dataset.edit !== undefined) form(values()[Number(button.dataset.edit)]);
    else if (button.dataset.delete !== undefined) {
      editing = clone(values()[Number(button.dataset.delete)]); mode = 'delete';
      $('#checker-title').textContent = 'Hapus Checker?'; $('#checker-ok').hidden = false;
      $('#checker-body').innerHTML = `<p>Nonaktifkan ${escape(editing.name)}? Histori dan pilihan sesi tetap tersimpan.</p>`;
    }
  };
  $('#checker-ok').onclick = () => run(async () => {
    if (mode === 'select') {
      if (state.sessionTransition) throw Error('Tunggu proses sesi selesai.');
      const rows = normalizeCheckers([...$('#checker-body').querySelectorAll('input:checked')].map(input => selected[Number(input.dataset.index)]));
      await ctx.flushDraft(); await ctx.db.saveCheckers(rows,expected);
      await ctx.changed(); ctx.ensureDraft(); ctx.renderReport(); message = 'Pilihan Checker sesi tersimpan.'; dialog.close(); return;
    }
    if (!navigator.onLine) throw Error('Offline. Pengelolaan master memerlukan koneksi; cache tetap tersedia.');
    const name = mode === 'delete' ? '' : checkerName($('#checker-name').value);
    if (mode !== 'delete' && values().some(c => c.checker_id !== editing?.checker_id && c.name.toUpperCase() === name.toUpperCase())) throw Error('Nama Checker duplikat.');
    if (state.checkerPending) throw Error('Selesaikan permintaan Checker yang tersimpan sebelum perubahan baru.');
    if (!validListVersion(state.checkerCache?.listVersion)) throw Error('Sync List Checker terlebih dahulu untuk mengambil versi daftar terbaru.');
    const payload = {action:mode === 'delete' ? 'deleteChecker' : editing ? 'editChecker' : 'addChecker',...(editing ? {checker_id:editing.checker_id} : {}),expected_version:state.checkerCache.listVersion,request_id:'chk_' + uid().replaceAll('-',''),...(mode === 'delete' ? {} : {name})};
    const pending = {id:'checker',payload,createdAt:now()};
    await ctx.db.beginCheckerRequest(pending); await ctx.changed();
    try { await completeRequest(pending,true); }
    catch(e) { if (state.checkerPending) manage(); throw e; }

  });
  $('#sync-checkers').onclick = () => run(async () => {
    if (!navigator.onLine) throw Error('Offline. Cache lama tetap tersedia.');
    await cache(await bridge.list()); message = 'Sync List Checker berhasil; snapshot Google Sheets dibaca.';
  });
}
