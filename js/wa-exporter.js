import { excelSerial } from './time-date.js';
import { assertRecord } from './validation.js';
export function exportLine(record) {
  assertRecord(record, { historical: true });
  return [String(excelSerial(record.operationDate)) + (record.ritaseNumber ? '-' + String(record.ritaseNumber).padStart(3, '0') : ''), record.dtNo, record.sourceCode,
    record.stockpile, record.pileId, '', record.productCode, record.dome,
    record.destination, record.time.slice(0, 5), record.scale].join('\t');
}
export const exportWA = records => records.filter(r => !r.deletedAt).map(exportLine).join('\n');
export const fingerprint = record => exportLine({ ...record, ritaseNumber: undefined }) + '\t' + record.time;
export function potentialDuplicates(record, records) {
  const key = fingerprint(record);
  return records.filter(r => !r.deletedAt && r.id !== record.id && fingerprint(r) === key);
}
export function filterRecords(records, filters = {}) {
  return records.filter(r => !r.deletedAt && Object.entries(filters).every(([k, v]) => !v || r[k] === v));
}
