import { excelSerial } from './time-date.js';
import { assertRecord } from './validation.js';
export function exportLine(record) {
  assertRecord(record, { historical: true });
  return [String(excelSerial(record.operationDate)), record.dtNo, record.sourceCode,
    record.stockpile, record.pileId, '', record.productCode, record.dome,
    record.destination, record.time, record.scale].join('\t');
}
export const exportWA = records => records.filter(r => !r.deletedAt).map(exportLine).join('\n');
export const fingerprint = record => exportLine(record);
export function potentialDuplicates(record, records) {
  const key = fingerprint(record);
  return records.filter(r => !r.deletedAt && r.id !== record.id && fingerprint(r) === key);
}
export function filterRecords(records, filters = {}) {
  return records.filter(r => !r.deletedAt && Object.entries(filters).every(([k, v]) => !v || r[k] === v));
}
