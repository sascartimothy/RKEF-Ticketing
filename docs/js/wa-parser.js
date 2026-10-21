import { dateFromSerial } from './time-date.js';
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
      const serial = legacy ? /^(\d+)-(\d{3,})$/.exec(columns[0])?.[1] : /^\d+$/.test(columns[0]) ? columns[0] : null;
      if (!serial) errors.push(legacy ? 'Format lama memerlukan tanggal bernomor, misalnya 46315-001.' : 'Tanggal baru harus serial Excel tanpa suffix.');
      if (!legacy && columns[5] !== '') errors.push('Kolom ke-6 wajib benar-benar kosong.');
      const c = legacy ? [...columns.slice(0, 5), '', ...columns.slice(5)] : columns;
      let operationDate = '';
      if (serial) try { operationDate = dateFromSerial(serial); } catch (e) { errors.push(e.message); }
      record = { operationDate, dtNo: c[1], sourceCode: c[2], stockpile: c[3], pileId: c[4], productCode: c[6], dome: c[7], destination: c[8], time: c[9], scale: c[10], note: '' };
      errors.push(...validateRecord(record, { historical: true }));
      if (legacy) warnings.push('Lama: pemetaan 10 kolom → 11 kolom perlu disahkan (kolom kosong disisipkan setelah Pile ID).');
      if (!errors.length) {
        const key = fingerprint(record);
        if (seen.has(key)) warnings.push('Potensi duplikat identik. DT yang sama saja bukan duplikat.');
        seen.add(key);
      }
    }
    return { line: index + 1, raw, columns, legacy, record, errors, warnings };
  });
}
export async function sourceDigest(text) {
  const data = new TextEncoder().encode(String(text).replace(/\r\n/g, '\n').replace(/\n$/, ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
