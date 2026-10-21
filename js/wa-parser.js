import { dateFromSerial, excelSerial, normalizeTime } from './time-date.js';
import { validateRecord } from './validation.js';
import { fingerprint } from './wa-exporter.js';
export function parseWA(text, existing = []) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop(); // An export's final line terminator is not a source row.
  const seen = new Set(existing.filter(r => !r.deletedAt).map(fingerprint));
  return lines.map((raw, index) => {
    const columns = raw.split('\t');
    const errors = [], warnings = [];
    const legacy = columns.length === 10;
    let record = null;
    if (![10, 11].includes(columns.length)) errors.push(`Ditemukan ${columns.length} kolom; wajib 11 (baru) atau 10 (lama).`);
    else {
      const numbered = /^(\d+)-(\d{3,})$/.exec(columns[0]);
      const serial = numbered?.[1] || (!legacy && /^\d+$/.test(columns[0]) ? columns[0] : null);
      if (!serial) errors.push(legacy ? 'Format lama memerlukan tanggal bernomor, misalnya 46315-001.' : 'Kode tanggal harus serial Excel valid; handover baru memerlukan suffix ritase.');
      if (!legacy && columns[5] !== '') errors.push('Kolom ke-6 wajib benar-benar kosong.');
      const c = legacy ? [...columns.slice(0, 5), '', ...columns.slice(5)] : columns;
      let operationDate = '';
      if (serial) try { operationDate = dateFromSerial(serial); } catch (e) { errors.push(e.message); }
      record = { operationDate, ...(numbered && Number.isSafeInteger(Number(numbered[2])) && Number(numbered[2]) > 0 ? { ritaseNumber: Number(numbered[2]) } : {}), dtNo: c[1], sourceCode: c[2], stockpile: c[3], pileId: c[4], productCode: c[6], dome: c[7], destination: c[8], time: normalizeTime(c[9]) ?? c[9], scale: c[10], note: '' };
      if (normalizeTime(c[9]) === null) errors.push('Waktu sumber WA tidak valid; gunakan format menit yang disahkan.');
      errors.push(...validateRecord(record, { historical: true }));
      if (legacy) warnings.push('Lama: pemetaan 10 kolom → 11 kolom perlu disahkan (kolom kosong disisipkan setelah Pile ID).');
      if (!errors.length) {
        const key = fingerprint(record);
        if (seen.has(key)) warnings.push('Potensi duplikat identik. DT yang sama saja bukan duplikat.');
        seen.add(key);
      }
    }
    return { line: index + 1, raw, sourceTime: columns.length === 10 ? columns[8] : columns[9], columns, legacy, record, errors, warnings };
  });
}
export async function sourceDigest(text) {
  const data = new TextEncoder().encode(String(text).replace(/\r\n/g, '\n').replace(/\n$/, ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}

// Legacy parsing remains read-only compatible. Only this whole-report validator may prepare a new session.
export function inspectHandover(source, existing = []) {
  const rows = parseWA(source, existing);
  const errors = [];
  const add = (row, message) => { row.errors.push(message); };
  if (!source || !rows.length) errors.push('Laporan kosong; bootstrap menunggu OD-08.');
  for (const row of rows) {
    if (row.columns.length !== 11 || !/^(\d+)-(\d{3,})$/.test(row.columns[0]) || !row.record?.ritaseNumber) add(row, 'Handover wajib 11 kolom dengan serial + suffix positif minimum tiga digit. Format lama menunggu OD-05.');
    if (row.columns.length === 11 && !['BDM', 'ONI'].includes(row.columns[10])) add(row, 'Timbangan wajib BDM atau ONI.');
  }
  const scales = new Set(rows.filter(r => r.columns.length === 11).map(r => r.columns[10]));
  if (scales.size > 1) for (const row of rows) add(row, 'Campuran timbangan: seluruh impor ditolak. Periksa kolom 11 pada baris ini.');
  const dates = new Set(rows.map(r => r.record?.operationDate).filter(Boolean));
  if (dates.size > 1) for (const row of rows) add(row, 'Tanggal operasi laporan tidak seragam.');
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], n = row.record?.ritaseNumber;
    if (!n) continue;
    if (seen.has(n)) add(row, 'Nomor ganda; penanganan menunggu OD-03.');
    seen.add(n);
    if (i && rows[i - 1].record?.ritaseNumber && n !== rows[i - 1].record.ritaseNumber + 1) add(row, 'Urutan / gap nomor bermasalah; penanganan menunggu OD-03. Tidak diurutkan atau diisi otomatis.');
  }
  let session = null, sourceShift = null;
  if (!errors.length && rows.every(r => !r.errors.length)) {
    const first = rows[0].record, last = rows.at(-1).record;
    sourceShift = first.ritaseNumber === 1 ? 'DS' : 'NS';
    const serial = excelSerial(first.operationDate) + (sourceShift === 'NS' ? 1 : 0);
    const nextNumber = sourceShift === 'DS' ? last.ritaseNumber + 1 : 1;
    try {
      if (!Number.isSafeInteger(nextNumber)) throw Error('Nomor ritase di luar rentang aman.');
      session = { operationDate: dateFromSerial(serial), shift: sourceShift === 'DS' ? 'NS' : 'DS', scale: first.scale,
        checker: '', checkerConfirmed: false, nextNumber, nextRitase: `${serial}-${String(nextNumber).padStart(3, '0')}`, handoverConfirmed: true };
    } catch (error) { errors.push(error.message); }
  }
  return { rows, errors, session, sourceShift, valid: !!session && !errors.length && rows.every(r => !r.errors.length) };
}
