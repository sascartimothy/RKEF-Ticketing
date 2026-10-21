const DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);
export function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw Error('Tanggal harus YYYY-MM-DD.');
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 9999 || date.toISOString().slice(0, 10) !== value) throw Error('Tanggal kalender tidak valid.');
  return date;
}
export function excelSerial(value) {
  const days = (calendarDate(value).getTime() - EPOCH) / DAY;
  return days < 61 ? days - 1 : days; // Excel's fictitious 1900-02-29 is never accepted.
}
export function dateFromSerial(value) {
  if (!/^\d{1,7}$/.test(String(value))) throw Error('Kode tanggal Excel tidak valid.');
  const n = Number(value);
  if (n < 1 || n === 60 || n > 2958465) throw Error('Kode tanggal Excel di luar rentang kalender.');
  return new Date(EPOCH + (n < 60 ? n + 1 : n) * DAY).toISOString().slice(0, 10);
}
// Operational WA notation: a single minute digit denotes tens of minutes.
export function normalizeTime(value) {
  if (typeof value !== 'string' || !/^\d{1,2}(?:\.\d{1,2})?$/.test(value)) return null;
  const [hour, minute = '00'] = value.split('.');
  const minutes = minute.padEnd(2, '0');
  if (Number(hour) > 23 || Number(minutes) > 59) return null;
  return `${hour.padStart(2, '0')}.${minutes}`;
}
export const validTime = value => typeof value === 'string' && value.length === 5 && /^(?:[01]\d|2[0-3])\.[0-5]\d$/.test(value);
export function localTime(date = new Date()) {
  return [date.getHours(), date.getMinutes()].map(n => String(n).padStart(2, '0')).join('.');
}
export function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
