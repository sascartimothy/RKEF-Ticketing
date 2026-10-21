import { calendarDate, validTime } from './time-date.js';
export const FIELDS = ['dtNo', 'sourceCode', 'stockpile', 'pileId', 'productCode', 'dome', 'destination', 'time', 'scale', 'checker', 'shift'];
export function textError(value, label = 'Nilai', max = 100) {
  if (typeof value !== 'string' || !value.length) return `${label} wajib diisi.`;
  if (value !== value.trim()) return `${label}: spasi di awal/akhir harus diperiksa.`;
  if (value.length > max || /[\u0000-\u001f\u007f<>]/.test(value)) return `${label}: karakter/ukuran tidak valid.`;
  return '';
}
export function validateRecord(record, { historical = false, allowUnknownChecker = false } = {}) {
  if (!record || typeof record !== 'object') return ['Record / snapshot tidak valid.'];
  const errors = [];
  if (record.ritaseNumber !== undefined && (!Number.isSafeInteger(record.ritaseNumber) || record.ritaseNumber < 1)) errors.push('Nomor ritase tidak valid.');
  try { calendarDate(record.operationDate); } catch (e) { errors.push(e.message); }
  for (const field of FIELDS) {
    if (historical && ['checker', 'shift'].includes(field)) continue;
    if (allowUnknownChecker && field === 'checker' && record.checker === '' && record.checkerConfirmed === false) continue;
    const error = textError(record[field], field);
    if (error) errors.push(error);
  }
  if (!validTime(record.time)) errors.push('Jam harus HH.mm (00.00–23.59).');
  if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 1000 || /[\u0000-\u001f\u007f]/.test(record.note))) errors.push('Note maksimal 1000 karakter, satu baris.');
  return errors;
}
export function assertRecord(record, options) {
  const errors = validateRecord(record, options);
  if (errors.length) throw Error(errors.join(' '));
}
export const nameKey = value => String(value).replace(/\s+/g, ' ').trim().toUpperCase();
export function destinationName(raw) {
  const name = String(raw).replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80 || /^[=+@'\-]/.test(name) || /[<>\u0000-\u001f\u007f]/.test(raw)) throw Error('Destination: 2–80 karakter, tanpa formula, TAB, atau karakter kontrol.');
  return name;
}
