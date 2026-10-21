import { state, activeMasters } from './state.js';
import { prepareSessionEnd, finishSessionEnd } from './operational-ui.js';
import { $, escape, busy, confirmAction } from './ui-components.js';
export function renderSetup() {
  const session = state.session;
  $('#handover-session').hidden = !session;
  $('#handover-session').textContent = session ? `Sesi aktif: ${session.operationDate.split('-').reverse().join('/')} · ${session.shift} · ${session.scale} · ${session.checker || 'Checker belum diisi'}` : '';
  $('#app-version').textContent = `RKEF Ticketing — v${window.RKEF_CONFIG.appVersion}`;
  $('#session-state').textContent = session?.handoverConfirmed ? 'Handover dikonfirmasi' : session ? 'Sesi existing — belum diverifikasi' : 'Belum aktif';
  $('#session-summary').textContent = session ? `${session.operationDate} · ${session.shift} · ${session.scale} · ${session.checker || 'Checker belum diisi'}` : 'Belum ada sesi aktif. Paste laporan handover di Setup.';
  $('#session-details').innerHTML = session ? `<dl class="session-details">${[
    ['Tanggal operasi', session.operationDate.split('-').reverse().join('/')], ['Shift', session.shift], ['Timbangan', session.scale],
    ['Checker', session.checker || 'Belum diisi'],
    ['Nomor ritase berikutnya', session.handoverConfirmed ? session.nextRitase : 'Belum diketahui — perlu handover valid']
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : '<p class="alert warning">Belum ada sesi. Tanggal, shift, timbangan, dan nomor berikutnya menunggu paste handover valid. Bootstrap tanpa laporan menunggu OD-08.</p>';
  if (session?.handoverConfirmed && !session.checker) $('#session-details').innerHTML += '<p class="alert warning">Isi nama checker yang sedang bertugas sebelum menyimpan ritase baru.</p>';
  if ($('#checker-form').dataset.session !== session?.handoverId) $('#checker-feedback').hidden = true;
  $('#checker-form').dataset.session = session?.handoverId || '';
  $('#checker-form').hidden = !session;
  if (document.activeElement !== $('#checker-form').elements.checker) $('#checker-form').elements.checker.value = session?.checker || '';
  const lists = {
    scale: activeMasters('scale').map(m => m.value), checker: activeMasters('checker').map(m => m.value),
    dt: state.records.filter(r => r.origin === 'local').map(r => r.dtNo),
    stock: activeMasters('stock').map(m => m.stockpile), pile: activeMasters('stock').map(m => m.pileId), source: activeMasters('stock').map(m => m.sourceCode),
    product: activeMasters('product').map(m => m.productCode), dome: activeMasters('product').map(m => m.dome),
    destination: [...(state.cache?.values || []).map(d => d.destination_name), ...activeMasters('product').map(m => m.destination)]
  };
  for (const [key, values] of Object.entries(lists)) $('#' + key + '-options').innerHTML = [...new Set(values)].sort().map(v => `<option value="${escape(v)}"></option>`).join('');
}
// Local master services and stored mappings remain available; editing UI is outside Setup v1.1.0.
export function initSetup(ctx) {
  $('#new-session').onclick = () => busy($('#new-session'), async () => {
    let locked = false, committed = false;
    const output = $('#import-preview');
    try {
      if ($('#confirm-dialog').open) throw Error('Selesaikan konfirmasi yang sedang terbuka.');
      await prepareSessionEnd(); locked = true;
      const settings = await ctx.db.all('settings');
      const session = settings.find(s => s.id === 'session')?.value || null;
      const draft = settings.find(s => s.id === 'draft')?.value || null;
      if (session || draft || state.draft) {
        if (!await confirmAction('Mulai Sesi Baru?', 'Semua ritase yang sudah disimpan pada sesi aktif ini, serta draft yang belum disimpan, akan dihapus secara permanen.\n\nData handover WhatsApp, master, dan transaksi sesi lainnya tetap tersimpan.\n\nPastikan laporan atau backup sesi ini sudah diamankan jika masih diperlukan.\n\nLanjutkan reset sesi?', 'Hapus Sesi & Mulai Baru')) return;
        // Check the visible session too; never end an unseen replacement session.
        if (JSON.stringify(session) !== JSON.stringify(state.session)) throw Error('Sesi berubah di tab lain. Muat ulang dan periksa sesi.');
        output.hidden = false; output.className = 'alert warning'; output.textContent = 'Menghapus sesi… Tunggu sampai penyimpanan selesai.';
        await ctx.db.endSession(session, draft);
      }
      committed = true;
      finishSessionEnd(true); locked = false;
      $('#wa-source').value = '';
      output.hidden = false; output.className = 'alert success';
      output.textContent = 'Sesi sebelumnya telah dihapus. Tempel laporan WhatsApp untuk memulai sesi baru.';
      await ctx.changed(); ctx.applySessionFilter();
      $('#wa-source').focus();
    } catch (error) {
      output.hidden = false; output.className = 'alert danger'; output.textContent = error.message;
    } finally { if (locked) finishSessionEnd(committed); }
  }).catch(ctx.fail);

  $('#checker-form').onsubmit = event => {
    event.preventDefault();
    if (state.sessionTransition) return;
    busy($('#checker-form button'), async () => {
      const feedback = $('#checker-feedback');
      feedback.hidden = true;
      try {
        await ctx.flushDraft();
        await ctx.db.saveChecker($('#checker-form').elements.checker.value, state.session);
        await ctx.changed(); ctx.ensureDraft(); ctx.applySessionFilter();
        feedback.className = 'alert success'; feedback.textContent = 'Checker tersimpan.';
      } catch (error) { feedback.className = 'alert danger'; feedback.textContent = error.message; }
      feedback.hidden = false;
    }).catch(ctx.fail);
  };
}
