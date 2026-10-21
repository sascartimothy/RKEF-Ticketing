import { state, activeMasters } from './state.js';
import { $, escape, busy } from './ui-components.js';
export function renderSetup() {
  const session = state.session;
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
  $('#checker-form').onsubmit = event => {
    event.preventDefault();
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
