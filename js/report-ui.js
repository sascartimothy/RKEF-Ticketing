import { state } from './state.js';
import { $, escape, toast, download } from './ui-components.js';
import { sessionReport } from './wa-exporter.js';

const identity = session => JSON.stringify(session && ['operationDate', 'shift', 'scale', 'handoverId', 'activationId'].map(k => session[k]));
function status(message, error = false) {
  $('#report-status').textContent = message;
  toast(message, error);
}
function showReport(report) {
  const { session, records, piles, total, text, error } = report;
  $('#report-status').textContent = '';
  $('#report-empty').hidden = !!session && total > 0;
  $('#report-empty').textContent = session ? 'Belum ada ritase pada sesi ini.' : 'Belum ada sesi aktif. Lakukan handover di halaman Setup.';
  $('#report-sections').hidden = !session;
  $('#report-count').textContent = total;
  $('#report-output').value = text;
  $('#report-error').hidden = !error;
  $('#report-error').textContent = error ? `Laporan tidak dapat disalin/diunduh: ${error}` : '';
  $('#copy-report').disabled = $('#export-txt').disabled = !state.ready || !session || !total || !!error;
  $('#report-session').innerHTML = session ? [['Tanggal Operasi', session.operationDate?.split('-').reverse().join('/')], ['Shift', session.shift], ['Timbangan', session.scale], ['Checker', session.checker || 'Belum diisi']].map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value || '—')}</dd></div>`).join('') : '';
  $('#report-piles').innerHTML = session ? `<table><thead><tr><th scope="col">Pile ID</th><th scope="col">Jumlah Ritase</th></tr></thead><tbody>${piles.map(p => `<tr><th scope="row">${escape(p.pileId || '(Pile ID tidak valid)')}</th><td>${p.count}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">TOTAL</th><td>${total}</td></tr></tfoot></table>` : '';
  $('#report-description').textContent = session ? `${records.length} ritase lokal sesi aktif. Checker adalah identitas petugas. Histori impor tidak disertakan.` : '';
}
export function renderReport() { showReport(sessionReport(state.records, state.session)); }
export function initReport(ctx) {
  async function currentReport() {
    // Read session and records atomically immediately before exporting, including changes in other tabs.
    const previous = identity(state.session);
    const snapshot = await ctx.db.snapshot();
    const session = snapshot.settings.find(s => s.id === 'session')?.value || null;
    const report = sessionReport(snapshot.records, session);
    showReport(report);
    if (previous !== identity(session)) {
      await ctx.changed();
      throw Error('Sesi aktif berubah. Periksa informasi sesi sebelum menyalin atau mengunduh kembali.');
    }
    if (report.error) throw Error(report.error);
    if (!session || !report.total) throw Error('Belum ada ritase pada sesi aktif untuk dilaporkan.');
    return report;
  }
  $('#copy-report').onclick = async () => {
    try {
      const report = await currentReport();
      try {
        await navigator.clipboard.writeText(report.text);
        status(`${report.total} ritase disalin, 11 kolom TAB per baris.`);
      } catch {
        $('#report-preview').open = true;
        const output = $('#report-output'); output.focus(); output.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch { /* Manual selection remains available. */ }
        status(copied ? `${report.total} ritase disalin, 11 kolom TAB per baris.` : 'Clipboard dibatasi browser. Seluruh teks dipilih; gunakan Salin pada perangkat.', !copied);
      }
    } catch (error) { status(error.message, true); }
  };
  $('#export-txt').onclick = async () => {
    try {
      const report = await currentReport();
      download(`RKEF-${report.session.operationDate}-${report.session.shift}-${report.session.scale}.txt`, report.text);
      status(`Unduhan TXT ${report.total} ritase dimulai. Periksa folder unduhan.`);
    } catch (error) { status(error.message, true); }
  };
}
