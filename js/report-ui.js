import { state, now } from './state.js';
import { $, escape, options, toast, busy, confirmAction, download, displayStamp } from './ui-components.js';
import { exportWA, exportLine, filterRecords } from './wa-exporter.js';
import { localDate } from './time-date.js';
import { validateBackup } from './database.js';
export function applySessionFilter() {
  const f = $('#filter-form');
  for (const k of ['operationDate', 'shift', 'scale', 'checker']) {
    const value = state.session?.[k] || (k === 'operationDate' ? localDate() : '');
    if (k !== 'operationDate') f.elements[k].innerHTML = options(state.records.map(r => r[k]), value);
    f.elements[k].value = value;
  }
  for (const k of ['stockpile', 'dome', 'destination']) f.elements[k].value = '';
  f.elements.origin.value = 'local'; renderReport();
}
export function renderReport() {
  const form = $('#filter-form');
  for (const k of ['shift', 'scale', 'checker', 'stockpile', 'dome', 'destination']) {
    const el = form.elements[k];
    el.innerHTML = options(state.records.filter(r => !r.deletedAt).map(r => r[k]), el.value);
  }
  const filters = Object.fromEntries(new FormData(form));
  const records = filterRecords(state.records, filters).sort((a, b) => a.operationDate.localeCompare(b.operationDate) || (a.scale === b.scale && a.ritaseNumber && b.ritaseNumber ? a.ritaseNumber - b.ritaseNumber : 0) || a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  $('#report-count').textContent = records.length;
  $('#report-description').textContent = filters.origin === 'local' ? 'Input lokal sesuai filter. Histori handover tidak ikut otomatis.' : filters.origin === 'import' ? 'Histori dari handover yang sudah disahkan.' : 'Semua sumber dipilih. Periksa potensi tumpang tindih handover.';
  $('#report-output').value = exportWA(records);
  $('#copy-report').disabled = !records.length; $('#export-txt').disabled = !records.length;
  const headers = ['Serial Excel', 'DT No', 'Source', 'Stockpile', 'Pile ID', 'Kosong', 'Product', 'Dome', 'Destination', 'Waktu', 'Timbangan', 'Sumber'];
  $('#report-table').innerHTML = records.length ? `<table><thead><tr>${headers.map(v => `<th scope="col">${v}</th>`).join('')}</tr></thead><tbody>${records.slice(0, 500).map(r => `<tr>${exportLine(r).split('\t').map((v, i) => `<td${i === 5 ? ' class="blank"' : ''}>${escape(v)}</td>`).join('')}<td>${r.origin === 'local' ? 'Lokal' : 'Impor'}</td></tr>`).join('')}</tbody></table>${records.length > 500 ? '<p class="hint">Tabel menampilkan 500 pertama; teks WA dan ekspor berisi semua hasil filter.</p>' : ''}` : '<p class="empty">Belum ada transaksi sesuai filter.</p>';
}
export function initReport(ctx) {
  async function recoveryBackup() {
    let draftError;
    try { await ctx.flushDraft(); } catch (e) { draftError = e; }
    const backup = await ctx.db.backup();
    if (state.draft?.dirty) {
      backup.stores.settings = backup.stores.settings.filter(s => s.id !== 'draft');
      backup.stores.settings.push({ id: 'draft', value: structuredClone(state.draft) });
    }
    if (draftError) { backup.draftRecovery = true; toast('Draft gagal disimpan ke browser; backup menyertakan salinan draft dari form yang masih terbuka.', true); }
    return backup;
  }
  $('#filter-form').onsubmit = e => e.preventDefault();
  $('#filter-form').onchange = renderReport;
  $('#active-filter').onclick = applySessionFilter;
  $('#clear-filter').onclick = () => { for (const el of $('#filter-form').elements) el.value = ''; renderReport(); };
  $('#copy-report').onclick = async () => {
    try { await navigator.clipboard.writeText($('#report-output').value); toast('Teks 11 kolom TAB disalin.'); }
    catch { const output = $('#report-output'); output.focus(); output.select(); toast('Clipboard dibatasi browser. Teks dipilih; gunakan Salin pada perangkat.', true); }
  };
  $('#export-txt').onclick = () => { download(`RKEF-${$('#filter-form').elements.operationDate.value || 'semua'}.txt`, $('#report-output').value); toast('Unduhan TXT dimulai.'); };
  $('#backup').onclick = () => busy($('#backup'), async () => {
    try {
      const backup = await recoveryBackup();
      download(`RKEF-backup-${now().replace(/[:.]/g, '-')}.json`, JSON.stringify(backup, null, 2), 'application/json');
      $('#backup-state').textContent = 'Unduhan dimulai: ' + displayStamp(backup.exportedAt) + '. Pastikan file benar-benar tersimpan.';
      toast('Unduhan backup lengkap dimulai. Periksa folder unduhan.');
    } catch (error) { ctx.fail(error); }
  });
  $('#restore-file').onchange = async e => {
    const el = $('#restore-preview'); el.hidden = true;
    try {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 50e6) throw Error('Backup melebihi batas 50 MB.');
      const backup = JSON.parse(await file.text());
      const count = validateBackup(backup);
      el.hidden = false;
      el.innerHTML = `<div class="alert warning">Backup valid secara struktur: ${count} objek, ${backup.stores.records.length} record (termasuk tombstone), ${backup.stores.masters.length} pilihan lokal.<br>Dibuat: ${escape(displayStamp(backup.exportedAt))}</div><label>Mode restore<select id="restore-mode"><option value="merge">Gabung — ID konflik membatalkan seluruh restore</option><option value="replace">Ganti seluruh data lokal dengan backup</option></select></label><p class="hint">ID internal dipertahankan. Backup yang sama dapat digabung ulang tanpa menggandakan record. Mode ganti menghapus data yang tidak ada di backup.</p><button id="confirm-restore" class="primary">Konfirmasi restore</button>`;
      $('#confirm-restore').onclick = () => busy($('#confirm-restore'), async () => {
        try {
          const mode = $('#restore-mode').value;
          if (mode === 'replace') {
            // A concrete export is prepared before the user confirms replacement.
            const current = await recoveryBackup();
            download(`RKEF-sebelum-restore-${Date.now()}.json`, JSON.stringify(current, null, 2), 'application/json');
          }
          if (!await confirmAction(mode === 'replace' ? 'Ganti seluruh data perangkat?' : 'Gabungkan backup?', mode === 'replace' ? 'Backup sebelum restore sudah ditawarkan untuk diunduh. Pastikan file tersimpan. Semua data lokal akan diganti secara atomik dengan file terpilih.' : 'Record dengan ID sama dan isi sama dilewati. ID dengan isi berbeda membatalkan seluruh penggabungan.', mode === 'replace' ? 'Ganti seluruh data' : 'Gabungkan')) return;
          await ctx.flushDraft();
          const n = await ctx.db.restore(backup, mode);
          await ctx.changed({ restoreDraft: true, fillSession: true }); ctx.fillDraft(); ctx.ensureDraft(); applySessionFilter();
          el.hidden = true; $('#restore-file').value = '';
          toast(`${n} objek dipulihkan. ID internal dipertahankan.`);
        } catch (error) { ctx.fail(error); }
      });
    } catch (error) { ctx.fail(error); }
  };
}
