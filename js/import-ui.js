import { state, activeMasters } from './state.js';
import { $, $$, escape, options, toast, busy, confirmAction } from './ui-components.js';
import { parseWA, sourceDigest } from './wa-parser.js';
import { deriveMappings, mappingKey, mappingFromRecord } from './master-data.js';
import { textError } from './validation.js';
let preview = null;
export function initImport(ctx) {
  $('#wa-source').oninput = () => { preview = null; $('#import-preview').hidden = true; $('#import-preview').replaceChildren(); };
  $('#preview-import').onclick = () => busy($('#preview-import'), async () => {
    try {
      const source = $('#wa-source').value;
      if (!source || source.length > 4e6) throw Error('Isi laporan; batas preview 4 MB.');
      const existing = await ctx.db.all('records');
      const rows = parseWA(source, existing);
      if (rows.length > 10000) throw Error('Maksimal 10.000 baris per impor.');
      const digest = await sourceDigest(source);
      const previous = await ctx.db.get('imports', digest);
      if ($('#wa-source').value !== source) throw Error('Teks berubah saat pemeriksaan. Jalankan preview lagi.');
      preview = { source, rows, digest };
      const mappings = deriveMappings(rows.filter(r => !r.errors.length).map(r => r.record), state.masters);
      const conflictCount = mappings.filter(m => m.conflicts.length).length;
      const invalid = rows.filter(r => r.errors.length).length;
      const el = $('#import-preview'); el.hidden = false;
      el.innerHTML = `<div class="alert ${previous || invalid || conflictCount ? 'warning' : 'success'}">${rows.length} baris · ${invalid} bermasalah · ${conflictCount} mapping bertentangan.${previous ? '<br><strong>Laporan ini sudah diimpor. Pengulangan tidak menambah record.</strong>' : ''}</div>
        <p class="hint">Pilih baris valid yang disahkan. Baris invalid tetap terlihat dan tidak bisa dipilih. Kolom lama: tanggal bernomor, DT, source, Stockpile, Pile ID, product, Dome, Destination, HH.mm, timbangan.</p>
        <div class="import-rows">${rows.map(r => `<div class="import-row"><label class="check-label"><input type="checkbox" data-import-line="${r.line}" ${r.errors.length || previous ? 'disabled' : 'checked'}><span>Baris ${r.line} · ${r.columns.length} kolom ${r.legacy ? '(lama)' : ''} ${r.record ? '· ' + escape(r.record.operationDate) : ''}</span></label><pre>${escape(r.raw)}</pre>${[...r.errors.map(v => `<div class="text-danger">${escape(v)}</div>`), ...r.warnings.map(v => `<div class="hint">⚠ ${escape(v)}</div>`)].join('')}</div>`).join('')}</div>
        <details><summary>Preview pilihan master (${mappings.length})</summary>${mappings.map(m => `<p class="hint ${m.conflicts.length ? 'text-danger' : ''}">${escape(m.kind === 'stock' ? `${m.stockpile} / ${m.pileId} / ${m.sourceCode}` : `${m.productCode} / ${m.dome} / ${m.destination}`)}${m.conflicts.length ? ' — BERTENTANGAN, tidak ditimpa' : ''}</p>`).join('')}</details>
        <div class="form-grid"><label>Shift laporan sebelumnya<select id="import-shift">${options(activeMasters('shift').map(m => m.value), '', 'Pilih shift asal')}</select></label><label>Checker laporan sebelumnya<input id="import-checker" list="checker-options" maxlength="100" placeholder="Isi checker asal"></label></div>
        <label class="check-label"><input id="ack-legacy" type="checkbox"><span>Saya memeriksa dan menyetujui pemetaan format lama 10 kolom (bila ada).</span></label>
        <label class="check-label"><input id="ack-duplicates" type="checkbox"><span>Potensi duplikat identik yang dipilih merupakan transaksi sah.</span></label>
        <label class="check-label"><input id="ack-mapping" type="checkbox"><span>Saya meninjau mapping bertentangan (bila ada); semua pilihan dipertahankan dengan penanda untuk diperbaiki secara eksplisit.</span></label>
        <p class="hint">Tanggal dan timbangan berasal dari setiap baris sumber. Shift/checker hanya melengkapi histori impor. Baris yang disahkan menjadi sumber handover terbaru; pilihan dari handover lama yang tidak ada di laporan terbaru dinonaktifkan setelah konfirmasi. Tambahan/koreksi lokal dan snapshot transaksi dipertahankan.</p>
        <button id="confirm-import" class="primary full" ${previous ? 'disabled' : ''}>Sahkan & impor baris terpilih</button>`;
      $('#confirm-import').onclick = () => busy($('#confirm-import'), async () => {
        try {
          if (!preview || preview.source !== $('#wa-source').value) throw Error('Teks berubah. Periksa ulang preview.');
          const selected = new Set($$('[data-import-line]:checked', el).map(i => Number(i.dataset.importLine)));
          const rows = preview.rows.filter(r => selected.has(r.line) && !r.errors.length);
          if (!rows.length) throw Error('Pilih setidaknya satu baris valid.');
          const metadata = { shift: $('#import-shift').value, checker: $('#import-checker').value };
          for (const [k, v] of Object.entries(metadata)) { const error = textError(v, k); if (error) throw Error(error); }
          const freshRecords = await ctx.db.all('records');
          const rechecked = parseWA(preview.source, freshRecords).filter(r => selected.has(r.line));
          const duplicates = rechecked.some(r => r.warnings.some(w => w.startsWith('Potensi')));
          const freshMasters = await ctx.db.all('masters');
          const mappings = deriveMappings(rows.map(r => r.record), freshMasters);
          const latestKeys = new Set(rows.flatMap(r => mappingFromRecord(r.record).map(mappingKey)));
          const superseded = freshMasters.filter(m => m.origin === 'handover' && m.active !== false && !latestKeys.has(m.key));
          if (rows.some(r => r.legacy) && !$('#ack-legacy').checked) throw Error('Sahkan pemetaan format lama terlebih dahulu.');
          if (duplicates && !$('#ack-duplicates').checked) throw Error('Periksa dan konfirmasi potensi duplikat.');
          if (mappings.some(m => m.conflicts.length) && !$('#ack-mapping').checked) throw Error('Periksa dan konfirmasi mapping bertentangan.');
          const excluded = preview.rows.length - rows.length;
          if (!await confirmAction('Sahkan handover?', `${rows.length} baris menjadi histori impor; ${excluded} baris tidak dimasukkan.\n${superseded.length} pilihan khusus handover lama yang tidak ada pada baris terpilih akan dinonaktifkan. Pilihan tambahan/koreksi lokal dan snapshot transaksi dipertahankan.\nSesi aktif tidak diganti.`, 'Sahkan & simpan')) return;
          const decisions = { selectedLines: [...selected], excludedLines: preview.rows.filter(r => !selected.has(r.line)).map(r => ({ line: r.line, raw: r.raw, errors: r.errors })), supersededMasterIds: superseded.map(m => m.id), legacy: $('#ack-legacy').checked, duplicates: $('#ack-duplicates').checked, mapping: $('#ack-mapping').checked };
          const result = await ctx.db.importHandover({ digest: preview.digest, rows, mappings: mappings.map(m => ({ ...m, key: mappingKey(m) })), metadata, decisions });
          await ctx.changed();
          $('#confirm-import').hidden = true;
          toast(result.already ? 'Laporan ini sudah diimpor. Tidak ada record tambahan.' : `${result.count} histori impor dan pilihan master tersimpan.`);
        } catch (error) { ctx.fail(error); }
      });
    } catch (error) { ctx.fail(error); }
  });
}
