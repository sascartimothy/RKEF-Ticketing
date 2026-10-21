import { uid, now, clone } from './state.js';
import { assertRecord, destinationName, textError } from './validation.js';
import { calendarDate, validTime, excelSerial, normalizeTime } from './time-date.js';
import { validateList } from './apps-script-api.js';
import { mappingErrors, mappingFromRecord, mappingKey, conflicts, deriveMappings } from './master-data.js';
import { inspectHandover, sourceDigest } from './wa-parser.js';
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
  async saveChecker(checker, expectedSession) {
    const error = textError(checker, 'Checker');
    if (error) throw Error(error);
    return this.transaction(['settings', 'masters', 'audit'], 'readwrite', async s => {
      const active = await request(s.settings.get('session'));
      if (!active || canonical(active.value) !== canonical(expectedSession)) throw Error('Sesi berubah. Isi checker ulang.');
      const draft = await request(s.settings.get('draft'));
      if (draft?.value?.dirty || draft?.value?.editId) throw Error('Selesaikan draft sebelum mengganti checker.');
      const value = { ...active.value, checker, checkerConfirmed: true, savedAt: now() };
      s.settings.put({ id: 'session', value });
      const masters = await request(s.masters.getAll());
      if (!masters.some(m => m.kind === 'checker' && m.value === checker && m.active !== false)) s.masters.add({ id: uid(), kind: 'checker', value: checker, active: true, origin: 'local', createdAt: now() });
      s.audit.add({ id: uid(), action: 'session-checker', at: now(), before: active.value, after: value });
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
  async importHandover({ digest, rows, mappings, metadata, decisions, source }) {
    // Existing historical-import service is retained for compatibility; new Setup always supplies the complete source.
    let handover = null;
    if (source !== undefined) {
      if (typeof source !== 'string' || source.length > 4e6) throw Error('Sumber handover tidak valid.');
      digest = await sourceDigest(source);
      handover = inspectHandover(source);
      if (!handover.valid || handover.rows.length > 10000) throw Error('Laporan tidak valid; seluruh impor ditahan. Periksa preview / OPEN DECISION.');
      rows = handover.rows;
      metadata = { shift: handover.sourceShift, checker: '', checkerConfirmed: false };
    }
    for (const row of rows) assertRecord({ ...row.record, ...metadata }, { allowUnknownChecker: !!handover });
    return this.transaction(['records', 'masters', 'imports', 'audit', 'settings'], 'readwrite', async s => {
      const previous = await request(s.imports.get(digest));
      if (previous) return { already: true, count: previous.count };
      if (handover) {
        const active = await request(s.settings.get('session'));
        if (decisions && 'expectedSession' in decisions && canonical(active?.value || null) !== canonical(decisions.expectedSession)) throw Error('Sesi berubah sejak preview. Periksa handover ulang (OD-06).');
        const records = await request(s.records.getAll());
        const draft = await request(s.settings.get('draft'));
        if (draft?.value?.dirty || draft?.value?.editId) throw Error('Draft aktif belum selesai. Konflik handover menunggu OD-06; data tidak diubah.');
        const target = handover.session;
        const receipts = await request(s.imports.getAll());
        const rank = value => `${value.operationDate}/${value.shift === 'NS' ? '1' : '0'}`;
        const known = [active?.value, ...receipts.map(r => r.session)].filter(v => v?.handoverConfirmed && v.scale === target.scale);
        if (known.some(v => rank(target) < rank(v) || (rank(target) === rank(v) && target.nextNumber < v.nextNumber))) throw Error('Handover akan memundurkan sesi / nomor persiapan timbangan ini. Rekonsiliasi menunggu OD-06.');
        if (records.some(r => r.operationDate === target.operationDate && r.scale === target.scale && r.origin === 'local')) throw Error('Sesi tujuan memiliki input lokal. Rekonsiliasi / aktivasi ulang menunggu OD-06.');
        const scopeKey = r => JSON.stringify([r.operationDate, r.scale]);
        const businessKey = r => JSON.stringify([r.operationDate, r.scale, r.ritaseNumber]);
        const unnumberedScopes = new Set(records.filter(r => !r.ritaseNumber).map(scopeKey));
        const identities = new Set(records.map(businessKey));
        for (const row of rows) {
          if (unnumberedScopes.has(scopeKey(row.record)) || identities.has(businessKey(row.record))) throw Error(`Baris ${row.line}: identitas bisnis bertumpang tindih dengan histori. Konflik / laporan tumpang tindih menunggu OD-06.`);
        }
        const freshMasters = await request(s.masters.getAll());
        mappings = deriveMappings(rows.map(r => r.record), freshMasters).map(m => ({ ...m, key: mappingKey(m) }));
      }
      const stamp = now();
      for (const row of rows) {
        const data = { ...row.record, ...metadata };
        const r = { ...data, id: uid(), origin: 'import', importId: digest, sourceLine: row.line, rawSource: row.raw,
          sourceSnapshot: clone(data), sourceTime: row.sourceTime ?? data.time, editedTime: data.time, createdAt: stamp, updatedAt: stamp, revision: 1 };
        s.records.add(r);
      }
      const masters = await request(s.masters.getAll());
      const latestKeys = new Set(rows.flatMap(row => mappingFromRecord(row.record).map(mappingKey)));
      const superseded = masters.filter(m => m.origin === 'handover' && m.active !== false && !latestKeys.has(m.key));
      if (Array.isArray(decisions?.supersededMasterIds) && canonical([...decisions.supersededMasterIds].sort()) !== canonical(superseded.map(m => m.id).sort())) throw Error('Master berubah sejak preview. Periksa dan konfirmasi impor ulang.');
      if (decisions?.mapping !== true && mappings.some(m => conflicts(m, masters).length)) throw Error('Konflik mapping baru muncul. Periksa dan konfirmasi impor ulang.');
      for (const m of superseded) s.masters.put({ ...m, active: false, supersededAt: stamp, supersededBy: digest });
      for (const m of mappings) {
        const { conflicts, ...value } = m;
        if (!masters.some(x => x.active !== false && x.key === value.key)) s.masters.add({ ...value, id: uid(), active: true, createdAt: stamp, importId: digest });
      }
      s.imports.add({ id: digest, count: rows.length, at: stamp, metadata, decisions, ...(handover ? { source, session: handover.session } : {}) });
      if (handover) s.settings.put({ id: 'session', value: { ...handover.session, handoverId: digest, savedAt: stamp } });
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
  const keys = value.handoverConfirmed && value.checkerConfirmed === false && value.checker === '' ? ['shift', 'scale'] : ['shift', 'scale', 'checker'];
  if (keys.some(k => textError(value[k], k))) throw Error('Identitas sesi backup rusak.');
  if (value.handoverConfirmed && (!['DS', 'NS'].includes(value.shift) || !['BDM', 'ONI'].includes(value.scale) || !Number.isSafeInteger(value.nextNumber) || value.nextNumber < 1 || value.nextRitase !== `${excelSerial(value.operationDate)}-${String(value.nextNumber).padStart(3, '0')}`)) throw Error('Metadata persiapan handover backup rusak.');
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
        assertRecord(row, { allowUnknownChecker: row.origin === 'import' });
        assertRecord(row.sourceSnapshot, { allowUnknownChecker: row.origin === 'import' });
        if (!['local', 'import'].includes(row.origin) || !Number.isInteger(row.revision) || row.revision < 1 || !validStamp(row.createdAt) || normalizeTime(row.sourceTime) === null) throw Error('Metadata record backup rusak.');
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
      if (n === 'audit' && (!validStamp(row.at) || !['create', 'correct', 'delete', 'master', 'import', 'dismiss-destination', 'session-checker'].includes(row.action))) throw Error('Log audit backup rusak.');
      if (n === 'imports' && (!/^[a-f0-9]{64}$/.test(row.id) || !validStamp(row.at) || !Number.isInteger(row.count) || row.count < 1)) throw Error('Receipt impor backup rusak.');
    }
  }
  return total;
}
