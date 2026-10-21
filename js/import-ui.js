import { state } from './state.js';
import { $, escape } from './ui-components.js';
import { inspectHandover } from './wa-parser.js';

function invalidSummary(report) {
  if (report.rows.some(row => row.errors.some(error => error.includes('Campuran timbangan')))) return 'Laporan mengandung campuran timbangan BDM dan ONI.';
  const bad = report.rows.filter(row => row.errors.length);
  const first = bad[0];
  return first ? `Baris ${first.line}: ${first.errors[0]}${bad.length > 1 ? ` (${bad.length} baris bermasalah.)` : ''}` : report.errors[0] || 'Format laporan tidak sesuai.';
}
export function initImport(ctx) {
  const textarea = $('#wa-source'), output = $('#import-preview');
  let processing = false;
  const status = (message, kind = 'warning') => {
    output.hidden = false; output.className = `alert ${kind}`; output.textContent = message;
  };
  // Typing/restoring a value never triggers an import. The next task reads the
  // complete value after the browser's native paste insertion and input event.
  textarea.oninput = () => { if (!processing) { output.hidden = true; output.replaceChildren(); } };
  textarea.onpaste = event => {
    if (processing) { event.preventDefault(); return; }
    processing = true;
    setTimeout(async () => {
      const source = textarea.value;
      textarea.readOnly = true;
      status('Memproses handover...');
      try {
        if (!source || source.length > 4e6) throw Error('Isi laporan; batas 4 MB.');
        const report = inspectHandover(source);
        if (report.rows.length > 10000) throw Error('Maksimal 10.000 baris per impor.');
        if (!report.valid) throw Error(invalidSummary(report));
        const expectedSession = (await ctx.db.get('settings', 'session'))?.value || null;
        await ctx.flushDraft();
        if (state.draft?.dirty || state.draft?.editId) throw Error('Selesaikan draft aktif sebelum handover.');
        const result = await ctx.db.importHandover({ source, decisions: { automatic: true, expectedSession } });
        await ctx.changed(); ctx.ensureDraft(); ctx.applySessionFilter();
        if (result.already) status('Laporan sudah diproses. Data dan sesi tetap dipertahankan.', 'success');
        else {
          const s = report.session;
          output.className = 'alert success'; output.hidden = false;
          output.innerHTML = `<strong>Handover berhasil</strong><ul><li>${result.count} ritase diproses.</li><li>Timbangan: ${escape(s.scale)}.</li><li>Sesi aktif: ${escape(s.shift)} \u2014 ${s.operationDate.split('-').reverse().join('/')}.</li><li>Ritase berikutnya: ${escape(s.nextRitase)}.</li></ul>`;
        }
      } catch (error) {
        console.error('Handover gagal', error);
        status(error.message, 'danger');
      } finally { processing = false; textarea.readOnly = false; }
    }, 0);
  };
}
