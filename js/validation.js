import { checkerText } from './checkers.js';
import { calendarDate, validTime, timePrecision } from './time-date.js';
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
  if (record.checkers !== undefined) {
    try { if (checkerText(record) !== record.checker) errors.push('Serialisasi Checker tidak cocok.'); } catch(e) { errors.push(e.message); }
  }
  if (record.ritaseNumber !== undefined && (!Number.isSafeInteger(record.ritaseNumber) || record.ritaseNumber < 1)) errors.push('Nomor ritase tidak valid.');
  try { calendarDate(record.operationDate); } catch (e) { errors.push(e.message); }
  for (const field of FIELDS) {
    if (historical && ['checker', 'shift'].includes(field)) continue;
    if (field === 'sourceCode' && (record[field] === '' || record[field] === undefined)) continue;
    if (allowUnknownChecker && field === 'checker' && record.checker === '' && record.checkerConfirmed === false) continue;
    if (field === 'productCode' && (record[field] === '' || record[field] === undefined)) continue;
    const error = textError(record[field], field === 'dome' ? 'Product Code' : field, field === 'checker' ? 4100 : 100);
    if (error) errors.push(error);
  }
  if (!validTime(record.time)) errors.push('Jam harus HH.mm atau HH.mm.ss (00.00.00–23.59.59).');
  if (record.timePrecision !== undefined && record.timePrecision !== timePrecision(record.time)) errors.push('Presisi waktu tidak sesuai nilai waktu.');
  if (record.timeMode !== undefined && !['auto', 'manual'].includes(record.timeMode)) errors.push('Mode waktu tidak valid.');
  if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 1000 || /[\u0000-\u001f\u007f]/.test(record.note))) errors.push('Note maksimal 1000 karakter, satu baris.');
  return errors;
}
export function assertRecord(record, options) {
  const errors = validateRecord(record, options);
  if (errors.length) throw Error(errors.join(' '));
}
export const nameKey = value => String(value).replace(/\s+/g, ' ').trim().toUpperCase();
// Popup identity rules only: never apply these to imported/history records.
export const STOCKPILE_PATTERN = /^(?:BR-C_\d{2}|DS-C_\d{2}[A-Z]?|LS_\d{2}|SS_\d{2})$/;
export const PILE_ID_PATTERN = /^(?:BR-C\d{1,2}[A-Z]?|DS-C\d{1,2}[A-Z]?|C\d{1,2}[A-Z]?|GT\d{1,2}|L\d{1,2}[A-Z]?|S\d{1,2}[A-Z]?|SLNC|Eppe)_(?:PL\d{2,3}|S\d{2,3}|L\d{2,3}|\d{2,3})$/;
export function stockIdentityErrors(input, original = null) {
  const errors = {};
  for (const [field, pattern, message] of [
    ['stockpile', STOCKPILE_PATTERN, 'Format Stockpile tidak sesuai. Contoh: SS_14, LS_02, BR-C_05, atau DS-C_05B.'],
    ['pileId', PILE_ID_PATTERN, 'Format Pile ID tidak sesuai. Contoh: S14_38, L6_308, BR-C2_S02, atau S6_PL01.']
  ]) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (value && value === original?.[field]) continue;
    if (!value || !pattern.test(value)) errors[field] = message;
  }
  return errors;
}
export function destinationName(raw) {
  const name = String(raw).replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80 || /^[=+@'\-]/.test(name) || /[<>\u0000-\u001f\u007f]/.test(raw)) throw Error('Destination: 2–80 karakter, tanpa formula, TAB, atau karakter kontrol.');
  return name;
}

export function normalizeDT(value, original = null) {
  if (value === original) return value;
  if (/^[0-9]+$/.test(value)) return `SAP_${value}`;
  if (/^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9]+$/.test(value)) return value;
  throw Error('Nomor DT: masukkan angka unit (820) atau kode lengkap seperti SAP_820.');
}
