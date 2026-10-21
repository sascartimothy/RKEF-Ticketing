import { uid, now, clone } from './state.js';
import { assertRecord, destinationName, textError } from './validation.js';
import { calendarDate, validTime } from './time-date.js';
import { validateList } from './apps-script-api.js';
import { mappingErrors, mappingFromRecord, mappingKey, conflicts } from './master-data.js';
import { potentialDuplicates } from './wa-exporter.js';
export const STORES = ['records', 'masters', 'settings', 'cache', 'audit', 'imports', 'pending'];
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
export class Database {
  constructor(db) { this.db = db; }
  static open(factory = globalThis.indexedDB, name = 'rkef-ticketing') {
    return new Promise((resolve, reject) => {
      if (!factory) return reject(Error('IndexedDB tidak tersedia. Gunakan browser biasa dan izinkan penyimpanan.'));
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => { for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' }); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(Error('Penyimpanan terkunci oleh tab lain. Tutup tab aplikasi lain dan muat ulang.'));
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); globalThis.dispatchEvent?.(new Event('rkef-storage-closed')); };
        resolve(new Database(req.result));
      };
    });
  }
  async transaction(names, mode, work) {
    const tx = this.db.transaction(names, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || Error('Transaksi dibatalkan; tidak ada data yang disimpan.'));
      tx.onerror = () => {}; // The abort event is authoritative.
    });
    done.catch(() => {});
    const stores = Object.fromEntries(names.map(n => [n, tx.objectStore(n)]));
    try { const result = await work(stores); await done; return result; }
    catch (error) { try { tx.abort(); } catch { /* already completed/aborted */ } await done.catch(() => {}); throw error; }
  }
  get(store, id) { return this.transaction([store], 'readonly', s => request(s[store].get(id))); }
  all(store) { return this.transaction([store], 'readonly', s => request(s[store].getAll())); }
  put(store, value) { return this.transaction([store], 'readwrite', s => request(s[store].put(clone(value)))); }
  async saveSession(value) {
    assertRecord({ ...value, dtNo: 'check', sourceCode: 'check', stockpile: 'check', pileId: 'check', productCode: 'check', dome: 'check', destination: 'check', time: '00.00' });
    return this.transaction(['settings', 'masters'], 'readwrite', async s => {
      const masters = await request(s.masters.getAll());
      for (const kind of ['scale', 'checker', 'shift']) if (!masters.some(m => m.kind === kind && m.value === value[kind] && m.active !== false)) s.masters.put({ id: uid(), kind, value: value[kind], active: true, origin: 'local', createdAt: now() });
      s.settings.put({ id: 'session', value: { ...value, savedAt: now() } });
    });
  }
  async snapshot() {
    return this.transaction(STORES, 'readonly', async s => Object.fromEntries(await Promise.all(STORES.map(async n => [n, await request(s[n].getAll())]))));
  }
  async saveRecord(data, { expectedRevision = null, draftId = null, sourceTime = data.time, duplicateConfirmed = false, mappingConfirmed = false } = {}) {
    assertRecord(data);
    return this.transaction(['records', 'audit', 'settings'], 'readwrite', async s => {
      const previous = await request(s.records.get(data.id));
      if (previous && expectedRevision === null) {
        // A retried submission must never overwrite an unrelated record.
        if (previous.draftId !== draftId || !draftId) throw Error('ID sudah digunakan. Muat ulang data.');
        if (Object.entries(data).some(([k,v]) => canonical(previous[k]) !== canonical(v))) throw Error('Draft ini sudah menjadi ritase tersimpan dengan isi berbeda. Buka Koreksi dari riwayat; jangan membuat sukses palsu.');
        s.settings.delete('draft');
        return previous;
      }
      if (expectedRevision !== null && (!previous || previous.deletedAt || previous.revision !== expectedRevision)) throw Error('Data berubah di tab lain. Buka ulang koreksi sebelum menyimpan.');
      if (!duplicateConfirmed && potentialDuplicates(data, await request(s.records.getAll())).length) throw Error('Potensi duplikat baru ditemukan. Kirim lagi untuk meninjau dan mengonfirmasi.');
      const stamp = now();
      const record = { ...clone(data), origin: 'local', createdAt: previous?.createdAt || stamp,
        updatedAt: stamp, revision: (previous?.revision || 0) + 1,
        sourceTime: previous?.sourceTime || sourceTime, editedTime: data.time,
        sourceSnapshot: previous?.sourceSnapshot || clone(data), draftId,
        duplicateConfirmed, mappingConfirmed };
      s.records.put(record);
      s.audit.add({ id: uid(), recordId: record.id, action: previous ? 'correct' : 'create', at: stamp, before: previous || null, after: clone(record) });
      s.settings.delete('draft');
      return record;
    });
  }
  async deleteRecord(id, revision) {
    return this.transaction(['records', 'audit'], 'readwrite', async s => {
      const previous = await request(s.records.get(id));
      if (!previous || previous.deletedAt || previous.revision !== revision) throw Error('Data berubah. Muat ulang riwayat.');
      const record = { ...previous, deletedAt: now(), revision: revision + 1 };
      s.records.put(record);
      s.audit.add({ id: uid(), recordId: id, action: 'delete', at: now(), before: previous, after: record });
    });
  }
  async importHandover({ digest, rows, mappings, metadata, decisions }) {
    for (const row of rows) assertRecord({ ...row.record, ...metadata });
    return this.transaction(['records', 'masters', 'imports', 'audit', 'settings'], 'readwrite', async s => {
      const previous = await request(s.imports.get(digest));
      if (previous) return { already: true, count: previous.count };
      const stamp = now();
      for (const row of rows) {
        const data = { ...row.record, ...metadata };
        const r = { ...data, id: uid(), origin: 'import', importId: digest, sourceLine: row.line, rawSource: row.raw,
          sourceSnapshot: clone(data), sourceTime: data.time, editedTime: data.time, createdAt: stamp, updatedAt: stamp, revision: 1 };
        s.records.add(r);
      }
      const masters = await request(s.masters.getAll());
      const latestKeys = new Set(rows.flatMap(row => mappingFromRecord(row.record).map(mappingKey)));
      const superseded = masters.filter(m => m.origin === 'handover' && m.active !== false && !latestKeys.has(m.key));
      if (Array.isArray(decisions?.supersededMasterIds) && canonical([...decisions.supersededMasterIds].sort()) !== canonical(superseded.map(m => m.id).sort())) throw Error('Master berubah sejak preview. Periksa dan konfirmasi impor ulang.');
      if (decisions?.mapping === false && mappings.some(m => conflicts(m, masters).length)) throw Error('Konflik mapping baru muncul. Periksa dan konfirmasi impor ulang.');
      for (const m of superseded) s.masters.put({ ...m, active: false, supersededAt: stamp, supersededBy: digest });
      for (const m of mappings) {
        const { conflicts, ...value } = m;
        if (!masters.some(x => x.active !== false && x.key === value.key)) s.masters.add({ ...value, id: uid(), active: true, createdAt: stamp, importId: digest });
      }
      s.imports.add({ id: digest, count: rows.length, at: stamp, metadata, decisions });
      s.settings.put({ id: 'lastHandover', value: digest });
      s.audit.add({ id: uid(), action: 'import', importId: digest, count: rows.length, at: stamp, decisions, supersededMasterIds: superseded.map(m => m.id) });
      return { already: false, count: rows.length };
    });
  }
  async saveMaster(master) {
    const errors = mappingErrors(master);
    if (errors.length) throw Error(errors.join(' '));
    return this.transaction(['masters', 'audit'], 'readwrite', async s => {
      const before = master.id ? await request(s.masters.get(master.id)) : null;
      const value = { ...master, id: master.id || uid(), updatedAt: now(), active: master.active !== false, origin: 'local' };
      s.masters.put(value);
      s.audit.add({ id: uid(), action: 'master', at: now(), before: before || null, after: value });
      return value;
    });
  }
  async backup() { return { application: 'RKEF_TICKETING', version: 1, exportedAt: now(), stores: await this.snapshot() }; }
  async restore(backup, mode = 'merge') {
    validateBackup(backup);
    if (!['merge', 'replace'].includes(mode)) throw Error('Mode restore tidak valid.');
    return this.transaction(STORES, 'readwrite', async s => {
      if (mode === 'replace') for (const n of STORES) s[n].clear();
      let count = 0;
      for (const n of STORES) for (const row of backup.stores[n]) {
        const existing = mode === 'merge' ? await request(s[n].get(row.id)) : null;
        if (existing && canonical(existing) !== canonical(row)) throw Error(`Konflik ID ${n}/${row.id}. Backup tidak digabung; gunakan perangkat kosong atau tinjau mode ganti.`);
        if (!existing) { s[n].put(clone(row)); count++; }
      }
      return count;
    });
  }
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function validSession(value) {
  if (!value || typeof value !== 'object') throw Error('Sesi backup rusak.');
  calendarDate(value.operationDate);
  if (['shift', 'scale', 'checker'].some(k => textError(value[k], k))) throw Error('Identitas sesi backup rusak.');
}
function validStamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function validateBackup(b) {
  if (b?.application !== 'RKEF_TICKETING' || b.version !== 1 || !b.stores || Object.keys(b.stores).sort().join() !== [...STORES].sort().join()) throw Error('Format/versi backup tidak didukung.');
  let total = 0;
  for (const n of STORES) {
    if (!Array.isArray(b.stores[n])) throw Error(`Store ${n} tidak valid.`);
    const ids = new Set();
    for (const row of b.stores[n]) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw Error(`ID kosong/duplikat di ${n}.`);
      ids.add(row.id);
      if (++total > 250000) throw Error('Backup terlalu besar (maks. 250.000 objek).');
      if (n === 'records') {
        assertRecord(row);
        assertRecord(row.sourceSnapshot);
        if (!['local', 'import'].includes(row.origin) || !Number.isInteger(row.revision) || row.revision < 1 || !validStamp(row.createdAt) || !validTime(row.sourceTime)) throw Error('Metadata record backup rusak.');
      }
      if (n === 'masters' && mappingErrors(row).length) throw Error('Master backup rusak.');
      if (n === 'settings' && row.id === 'session') {
        validSession(row.value);
      }
      if (n === 'settings' && row.id === 'draft') {
        const d = row.value;
        if (!d || typeof d.id !== 'string' || !d.id || !d.values || !validTime(d.sourceTime) || (d.editId ? !Number.isInteger(d.revision) : typeof d.recordId !== 'string')) throw Error('Metadata draft backup rusak.');
        validSession(d.session);
        for (const key of ['dtNo', 'stockpile', 'pileId', 'sourceCode', 'productCode', 'dome', 'destination', 'time', 'note']) if (typeof d.values[key] !== 'string' || d.values[key].length > (key === 'note' ? 1000 : 100)) throw Error('Nilai draft backup rusak.');
      }
      if (n === 'cache' && row.id === 'destinations') {
        if (!Array.isArray(row.values) || !validStamp(row.syncedAt)) throw Error('Cache Destination backup rusak.');
        validateList({ ok: true, count: row.values.length, destinations: row.values });
      }
      if (n === 'pending') {
        if (row.id !== 'destination' || typeof row.requestId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(row.requestId) || !validStamp(row.createdAt) || destinationName(row.name) !== row.name) throw Error('Permintaan Destination backup rusak.');
      }
      if (n === 'audit' && (!validStamp(row.at) || !['create', 'correct', 'delete', 'master', 'import', 'dismiss-destination'].includes(row.action))) throw Error('Log audit backup rusak.');
      if (n === 'imports' && (!/^[a-f0-9]{64}$/.test(row.id) || !validStamp(row.at) || !Number.isInteger(row.count) || row.count < 1)) throw Error('Receipt impor backup rusak.');
    }
  }
  return total;
}
