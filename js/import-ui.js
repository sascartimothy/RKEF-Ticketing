import { state } from './state.js';
import { $ } from './ui-components.js';
import { inspectHandover } from './wa-parser.js';

function invalidSummary(report) {
  if (report.rows.some(row => row.errors.some(error => error.includes('Campuran timbangan')))) return 'Laporan mengandung campuran timbangan BDM dan ONI.';
  const bad = report.rows.filter(row => row.errors.length);
  const first = bad[0];
  return first ? `Baris ${first.line}: ${first.errors[0]}${bad.length > 1 ? ` (${bad.length} baris bermasalah.)` : ''}` : report.errors[0] || 'Format laporan tidak sesuai.';
}
export async function processHandover(ctx) {
  const textarea = $('#wa-source'), output = $('#import-preview');
  const status = (message, kind = 'warning') => {
    output.hidden = false; output.className = `alert ${kind}`; output.textContent = message;
  };
  textarea.readOnly = true;
  status('Memproses handover...');
  try {
    const source = textarea.value;
    if (!source || source.length > 4e6) throw Error('Isi laporan; batas 4 MB.');
    const report = inspectHandover(source);
    if (report.rows.length > 10000) throw Error('Maksimal 10.000 baris per impor.');
    if (!report.valid) throw Error(invalidSummary(report));
    const settings = await ctx.db.all('settings');
    const expectedSession = settings.find(s => s.id === 'session')?.value || null;
    const expectedCycle = settings.find(s => s.id === 'handoverCycle')?.value || null;
    await ctx.flushDraft();
    if (state.draft?.dirty || state.draft?.editId) throw Error('Selesaikan draft aktif sebelum handover.');
    const result = await ctx.db.importHandover({ source, decisions: { automatic: true, expectedSession, expectedCycle } });
    await ctx.changed(); ctx.ensureDraft(); ctx.renderReport();
    if (!result.activated || !state.session?.handoverConfirmed) throw Error('Sesi operasional belum aktif. Periksa penyimpanan dan muat ulang.');
    status('Handover berhasil. Sesi operasional telah diaktifkan.', 'success');
  } catch (error) {
    console.error('Handover gagal', error);
    status(error.message, 'danger');
  } finally { textarea.readOnly = false; }
}
export function initImport(ctx) {
  const textarea = $('#wa-source'), output = $('#import-preview');
  let processing = false;
  // Typing/restoring a value never triggers an import. The next task reads the
  // complete value after the browser's native paste insertion and input event.
  textarea.oninput = () => { if (!processing) { output.hidden = true; output.replaceChildren(); } };
  textarea.onpaste = event => {
    if (processing || state.sessionTransition) { event.preventDefault(); return; }
    processing = true; state.sessionTransition = true;
    setTimeout(async () => {
      try {
        await processHandover(ctx);
      } finally { processing = false; state.sessionTransition = false; textarea.readOnly = false; ctx.ensureDraft(); }
    }, 0);
  };
}
