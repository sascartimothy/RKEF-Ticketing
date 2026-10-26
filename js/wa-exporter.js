import { excelSerial, calendarDate, timeOrderKey } from './time-date.js';
import { assertRecord } from './validation.js';
export function exportLine(record) {
  assertRecord(record, { historical: true });
  return [String(excelSerial(record.operationDate)) + (record.ritaseNumber ? '-' + String(record.ritaseNumber).padStart(3, '0') : ''), record.dtNo, '',
    record.stockpile, record.pileId, '', '', record.dome,
    record.destination, record.time.slice(0, 5), record.scale].join('\t');
}
export const exportWA = records => records.filter(r => !r.deletedAt).map(exportLine).join('\n');
// Duplicate identity follows current operational fields; legacy columns 3/7 are audit only.
export const fingerprint = record => exportLine({ ...record, ritaseNumber: undefined }) + '\t' + record.time;
export function potentialDuplicates(record, records) {
  const key = fingerprint(record);
  return records.filter(r => !r.deletedAt && r.id !== record.id && fingerprint(r) === key);
}
export function filterRecords(records, filters = {}) {
  return records.filter(r => !r.deletedAt && Object.entries(filters).every(([k, v]) => !v || r[k] === v));
}

// Read-only report projection. No counters or business numbers are changed here.
export function sessionReport(all, session) {
  const report = { session, records: [], piles: [], total: 0, text: '', error: '' };
  if (!session) return report;
  const sameShift = r => r.origin === 'local' && ['operationDate', 'shift', 'scale'].every(k => r[k] === session[k]);
  const candidates = all.filter(sameShift);
  report.records = candidates.filter(r => !r.deletedAt && r.numberingSession === session.handoverId && r.activationId === session.activationId);
  report.records.sort((a, b) => a.ritaseNumber - b.ritaseNumber);
  report.total = report.records.length;
  const piles = new Map();
  for (const r of report.records) piles.set(r.pileId, (piles.get(r.pileId) || 0) + 1);
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  report.piles = [...piles].map(([pileId, count]) => ({ pileId, count })).sort((a, b) => b.count - a.count || compare(a.pileId, b.pileId));
  try {
    calendarDate(session.operationDate);
    if (!session.handoverConfirmed || !session.handoverId || !['DS', 'NS'].includes(session.shift) || !['BDM', 'ONI'].includes(session.scale)) throw Error('Identitas sesi belum terverifikasi. Lakukan handover di Setup.');
    if (candidates.some(r => !r.numberingSession || (r.numberingSession === session.handoverId && session.activationId && !r.activationId))) throw Error('Identitas sesi/aktivasi ritase ambigu (OD-05/06). Periksa data sebelum membuat laporan.');
    const start = session.startNumber ?? session.nextNumber;
    if (!Number.isSafeInteger(start) || start < 1 || (report.total && session.startNumber === undefined)) throw Error('Nomor awal sesi belum terverifikasi (OD-05).');
    if ((session.shift === 'DS' && start !== 1) || (session.shift === 'NS' && start === 1)) throw Error('Nomor awal tidak sesuai identitas shift handover.');
    const ids = new Set(), numbers = new Set();
    for (const r of report.records) {
      try { assertRecord(r, { historical: true }); } catch (e) { throw Error(`Ritase ${r.id}: ${e.message}`); }
      if (!r.id || ids.has(r.id)) throw Error('Identitas UUID ritase hilang atau duplikat.');
      ids.add(r.id);
      if (!Number.isSafeInteger(r.ritaseNumber) || r.ritaseNumber < 1 || numbers.has(r.ritaseNumber)) throw Error('Nomor ritase hilang, tidak valid, atau duplikat.');
      numbers.add(r.ritaseNumber);
    }
    if (report.records.some((r, i) => r.ritaseNumber !== start + i) || session.nextNumber !== start + report.total || session.nextRitase !== `${excelSerial(session.operationDate)}-${String(session.nextNumber).padStart(3, '0')}`) throw Error('Urutan nomor/gap atau counter sesi tidak konsisten. Laporan diblokir tanpa membuat nomor pengganti.');
    // Detect collisions with frozen history/tombstones as well as active records.
    if (all.some(r => !ids.has(r.id) && r.operationDate === session.operationDate && r.scale === session.scale && numbers.has(r.ritaseNumber))) throw Error('Nomor ritase bertabrakan dengan histori/tombstone di luar sesi.');
    if (all.filter(r => ids.has(r.id)).length !== report.total) throw Error('Identitas UUID ritase duplikat pada sumber data.');
    if (session.shift === 'NS') {
      const nextDate = new Date(calendarDate(session.operationDate).getTime() + 86400000).toISOString().slice(0, 10);
      if (report.records.some(r => ![session.operationDate, nextDate].includes(r.actualDate))) throw Error('Tanggal aktual NS belum terverifikasi (OD-10).');
    }
    const chronological = [...report.records].sort((a, b) => (session.shift === 'NS' ? compare(a.actualDate, b.actualDate) : 0) || compare(timeOrderKey(a.time), timeOrderKey(b.time)) || compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
    if (chronological.some((r, i) => r.id !== report.records[i].id)) throw Error('Nomor tersimpan tidak sesuai urutan kronologis Opsi B. Periksa koreksi data.');
    const text = exportWA(report.records);
    const lines = text ? text.split('\n') : [];
    if (report.piles.reduce((n, p) => n + p.count, 0) !== report.total || lines.length !== report.total || lines.some(line => line.split('\t').length !== 11 || line.split('\t')[5] !== '')) throw Error('TOTAL rekap dan baris WhatsApp tidak konsisten.');
    report.text = text;
  } catch (error) { report.error = error.message; }
  return report;
}
