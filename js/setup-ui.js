import { initCheckers, renderCheckers } from './checker-ui.js';
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
  renderCheckers();
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
    let locked = false;
    const output = $('#import-preview');
    try {
      if ($('#confirm-dialog').open) throw Error('Selesaikan konfirmasi yang sedang terbuka.');
      await prepareSessionEnd(); locked = true;
      const settings = await ctx.db.all('settings');
      const session = settings.find(s => s.id === 'session')?.value || null;
      const draft = settings.find(s => s.id === 'draft')?.value || null;
      const cycle = settings.find(s => s.id === 'handoverCycle')?.value || null;
      {
        if (!await confirmAction('Mulai Sesi Baru?', 'SEMUA histori dan transaksi operasional lokal akan dihapus permanen, termasuk data BDM dan ONI, seluruh sesi, impor WhatsApp, draft, audit, dan mapping material.\n\nHanya cache master Checker dan Destination dari Google Sheets yang dipertahankan. Data Google Sheets tidak diubah.\n\nLanjutkan reset total?', 'Hapus Sesi & Mulai Baru')) return;
        // Check the visible session too; never end an unseen replacement session.
        if (JSON.stringify(session) !== JSON.stringify(state.session)) throw Error('Sesi berubah di tab lain. Muat ulang dan periksa sesi.');
        output.hidden = false; output.className = 'alert warning'; output.textContent = 'Menghapus seluruh data operasional… Tunggu sampai penyimpanan selesai.';
        await ctx.db.endSession(session, draft, cycle);
      }
      $('#wa-source').value = '';
      finishSessionEnd(true);
      location.hash = 'setup';
      // Hold the lock until committed state has been read back.
      state.sessionTransition = true;
      output.hidden = false; output.className = 'alert success';
      output.textContent = 'Seluruh data operasional lokal telah dihapus. Tempel laporan WhatsApp untuk memulai sesi baru.';
      await ctx.changed(); ctx.renderReport();
      $('#wa-source').focus();
    } catch (error) {
      output.hidden = false; output.className = 'alert danger'; output.textContent = error.message;
    } finally { if (locked) { finishSessionEnd(false); ctx.ensureDraft(); } }
  }).catch(ctx.fail);

  initCheckers(ctx);
}
