import { uid, now, clone } from './state.js';
import { assertRecord, destinationName, textError } from './validation.js';
import { calendarDate, validTime, excelSerial, normalizeTime, timeOrderKey, timePrecision } from './time-date.js';
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
  async saveDraft(value) {
    return this.transaction(['settings'], 'readwrite', async s => {
      const active = (await request(s.settings.get('session')))?.value;
      if (!active || ['activationId', 'handoverId', 'operationDate', 'shift', 'scale', 'checker'].some(k => active[k] !== value.session[k])) throw Error('Sesi draft sudah berakhir atau berubah. Muat ulang sebelum melanjutkan.');
      s.settings.put({ id: 'draft', value: clone(value) });
    });
  }
  async endSession(expectedSession, expectedDraft) {
    return this.transaction(['settings', 'records', 'audit'], 'readwrite', async s => {
      const session = (await request(s.settings.get('session')))?.value || null;
      const draft = (await request(s.settings.get('draft')))?.value || null;
      if (canonical(session) !== canonical(expectedSession) || canonical(draft) !== canonical(expectedDraft)) throw Error('Sesi atau draft berubah di tab lain. Muat ulang dan periksa sebelum memulai sesi baru.');
      if (!session && !draft) return false;
      if (!session) throw Error('Tidak ada sesi aktif yang dapat diidentifikasi. Tidak ada transaksi yang dihapus.');
      calendarDate(session.operationDate);
      if (!['DS', 'NS'].includes(session.shift) || !['BDM', 'ONI'].includes(session.scale) || !session.handoverId) throw Error('Identitas sesi tidak lengkap. Reset ditahan; tidak ada transaksi yang dihapus.');
      if (draft && ['activationId', 'handoverId', 'operationDate', 'shift', 'scale'].some(k => draft.session?.[k] !== session[k])) throw Error('Identitas draft berbeda dari sesi aktif. Reset ditahan.');
      const records = await request(s.records.getAll());
      const scope = records.filter(r => r.origin === 'local' && ['operationDate', 'shift', 'scale'].every(k => r[k] === session[k]));
      // Missing provenance cannot safely distinguish an older activation of the same report.
      if (scope.some(r => !r.numberingSession || (r.numberingSession === session.handoverId && session.activationId && !r.activationId))) throw Error('Identitas aktivasi ritase lokal tidak dapat dipastikan. Reset ditahan tanpa penghapusan.');
      const removed = scope.filter(r => r.numberingSession === session.handoverId && r.activationId === session.activationId);
      const ids = new Set(removed.map(r => r.id));
      for (const r of removed) s.records.delete(r.id); // Includes tombstones.
      for (const audit of await request(s.audit.getAll())) if (ids.has(audit.recordId)) s.audit.delete(audit.id);
      s.settings.delete('session');
      s.settings.delete('draft');
      s.audit.add({ id: uid(), action: 'session-reset', at: now(), session: Object.fromEntries(['operationDate', 'shift', 'scale', 'handoverId', 'activationId'].filter(k => session[k] !== undefined).map(k => [k, session[k]])), deletedCount: removed.length });
      return true;
    });
  }
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
  async saveRecord(data, { expectedRevision = null, draftId = null, sourceTime = data.time, duplicateConfirmed = false, mappingConfirmed = false, clockDate = null } = {}) {
    assertRecord(data);
    return this.transaction(['records', 'audit', 'settings', 'masters'], 'readwrite', async s => {
      const previous = await request(s.records.get(data.id));
      if (previous && expectedRevision === null) {
        // A retried submission must never overwrite an unrelated record.
        if (previous.draftId !== draftId || !draftId) throw Error('ID sudah digunakan. Muat ulang data.');
        if (Object.entries(data).some(([k,v]) => canonical(previous[k]) !== canonical(v))) throw Error('Draft ini sudah menjadi ritase tersimpan dengan isi berbeda. Buka Koreksi dari riwayat; jangan membuat sukses palsu.');
        const draft = await request(s.settings.get('draft'));
        if (draft?.value?.id === draftId) s.settings.delete('draft');
        return previous;
      }
      if (expectedRevision !== null && (!previous || previous.deletedAt || previous.revision !== expectedRevision)) throw Error('Data berubah di tab lain. Buka ulang koreksi sebelum menyimpan.');

      const active = (await request(s.settings.get('session')))?.value;
      if (!active?.handoverConfirmed || !active.handoverId || !['DS', 'NS'].includes(active.shift)) throw Error('Nomor awal belum terverifikasi. Paste handover valid di Setup (OD-08).');
      if (['operationDate', 'scale', 'shift', 'checker'].some(k => data[k] !== active[k])) throw Error('Sesi berubah atau histori sudah ditutup. Koreksi hanya untuk sesi aktif.');
      if (previous && (previous.origin !== 'local' || previous.numberingSession !== active.handoverId)) throw Error('Histori di luar sesi aktif tidak dapat dikoreksi (OD-05).');
      if (previous && previous.activationId !== active.activationId) throw Error('Identitas aktivasi berubah. Buka ulang sesi aktif sebelum koreksi.');
      if (!previous && active.activationId !== data.activationId) throw Error('Sesi draft sudah berakhir atau berubah. Muat ulang sebelum menyimpan.');
      if (data.handoverId && data.handoverId !== active.handoverId) throw Error('Sesi draft sudah berubah. Periksa handover aktif.');
      if (!duplicateConfirmed && potentialDuplicates(data, await request(s.records.getAll())).length) throw Error('Potensi duplikat baru ditemukan. Kirim lagi untuk meninjau dan mengonfirmasi.');
      const masters = await request(s.masters.getAll());
      for (const [kind, keys] of [['stock', ['stockpile', 'pileId', 'sourceCode']], ['product', ['productCode', 'dome', 'destination']]]) {
        if (previous && keys.every(k => previous[k] === data[k])) continue;
        const mapping = masters.find(m => m.active !== false && m.kind === kind && keys.every(k => m[k] === data[k]));
        if (!mapping || conflicts(mapping, masters).length) throw Error('Mapping material belum disahkan atau bertentangan. Periksa handover; kebijakan editing lokal belum disahkan.');
      }
      const stamp = now();
      const record = { ...clone(data), origin: 'local', createdAt: previous?.createdAt || stamp,
        updatedAt: stamp, revision: (previous?.revision || 0) + 1,
        sourceTime: previous?.sourceTime || sourceTime, editedTime: data.time,
        timePrecision: timePrecision(data.time),
        ...(previous && previous.time !== data.time ? { timeMode: 'manual' } : {}),
        sourceSnapshot: previous?.sourceSnapshot || clone(data), draftId,
        duplicateConfirmed, mappingConfirmed,
        numberingSession: active.handoverId,
        ...(active.activationId ? { activationId: active.activationId } : {}),
        actualDate: previous?.actualDate || (data.time === sourceTime ? clockDate : null) };
      // NS edited wall-clock time has no verified calendar date. Never infer a shift boundary.
      if (active.shift === 'NS' && previous && data.time !== previous.time) throw Error('BLOCKED: tanggal aktual koreksi NS belum dapat dipastikan (OD-10).');
      const all = await request(s.records.getAll());
      const plan = planNumbering(all, record, active);
      for (const changed of plan.records) {
        s.records.put(changed);
        if (changed.id !== record.id) s.audit.add({ id: uid(), recordId: changed.id, action: 'renumber', at: stamp, before: all.find(r => r.id === changed.id), after: clone(changed) });
      }
      Object.assign(record, plan.records.find(r => r.id === record.id));
      s.settings.put({ id: 'session', value: { ...active, startNumber: plan.startNumber, nextNumber: plan.nextNumber, nextRitase: `${excelSerial(active.operationDate)}-${String(plan.nextNumber).padStart(3, '0')}` } });
      s.audit.add({ id: uid(), recordId: record.id, action: previous ? 'correct' : 'create', at: stamp, before: previous || null, after: clone(record) });
      const draft = await request(s.settings.get('draft'));
      if (!previous && draft?.value?.id === draftId) s.settings.delete('draft');
      return record;
    });
  }
  async deleteRecord(id, revision) {
    return this.transaction(['records', 'audit'], 'readwrite', async s => {
      const previous = await request(s.records.get(id));
      if (!previous || previous.deletedAt || previous.revision !== revision) throw Error('Data berubah. Muat ulang riwayat.');
      if (previous.ritaseNumber) throw Error('Penghapusan ritase bernomor menunggu kebijakan gap/reuse (OD-02).');
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
      if (previous && !handover) return { already: true, count: previous.count };
      let activeSession = null;
      if (handover) {
        const active = await request(s.settings.get('session'));
        activeSession = active?.value || null;
        if (decisions && 'expectedSession' in decisions && canonical(active?.value || null) !== canonical(decisions.expectedSession)) throw Error('Sesi berubah sejak preview. Periksa handover ulang (OD-06).');
        const records = await request(s.records.getAll());
        const draft = await request(s.settings.get('draft'));
        if (draft?.value?.dirty || draft?.value?.editId) throw Error('Draft aktif belum selesai. Konflik handover menunggu OD-06; data tidak diubah.');
        const target = handover.session;
        const receipts = await request(s.imports.getAll());
        const rank = value => `${value.operationDate}/${value.shift === 'NS' ? '1' : '0'}`;
        const known = [active?.value, ...receipts.map(r => r.session)].filter(v => v?.handoverConfirmed && v.scale === target.scale);
        if (known.some(v => rank(target) < rank(v) || (rank(target) === rank(v) && target.nextNumber < v.nextNumber))) throw Error('Handover akan memundurkan sesi / nomor persiapan timbangan ini. Rekonsiliasi menunggu OD-06.');
        if (records.some(r => r.operationDate === target.operationDate && r.scale === target.scale && r.origin === 'local')) throw Error('Sesi tidak dapat diaktifkan karena nomor ritase bertabrakan dengan transaksi lokal yang sudah tersimpan. Rekonsiliasi menunggu OD-06.');
        if (records.some(r => r.operationDate === target.operationDate && r.scale === target.scale && (!r.ritaseNumber || r.ritaseNumber >= target.nextNumber))) throw Error('Sesi tidak dapat diaktifkan karena nomor ritase tujuan bertumpang tindih dengan histori tersimpan (OD-05/OD-06).');
        const scopeKey = r => JSON.stringify([r.operationDate, r.scale]);
        const businessKey = r => JSON.stringify([r.operationDate, r.scale, r.ritaseNumber]);
        const unnumberedScopes = new Set(records.filter(r => !r.ritaseNumber).map(scopeKey));
        const owned = previous ? records.filter(r => r.origin === 'import' && r.importId === digest) : [];
        const ownedByLine = new Map(owned.map(r => [r.sourceLine, r]));
        const ownedIds = new Set(owned.map(r => r.id));
        if (previous && (previous.count !== rows.length || owned.length !== rows.length || ownedByLine.size !== rows.length || rows.some(row => {
          const stored = ownedByLine.get(row.line);
          return !stored || stored.deletedAt || stored.rawSource !== row.raw ||
            Object.entries({ ...row.record, ...metadata }).some(([key, value]) => canonical(stored[key]) !== canonical(value));
        }))) throw Error('Histori laporan tidak sesuai receipt impor. Aktivasi ditahan tanpa mengubah data (OD-06).');
        const identities = new Set(records.filter(r => !ownedIds.has(r.id)).map(businessKey));
        for (const row of rows) {
          if (unnumberedScopes.has(scopeKey(row.record)) || identities.has(businessKey(row.record))) throw Error(`Baris ${row.line}: identitas bisnis bertumpang tindih dengan histori. Konflik / laporan tumpang tindih menunggu OD-06.`);
        }
        const freshMasters = await request(s.masters.getAll());
        mappings = deriveMappings(rows.map(r => r.record), freshMasters).map(m => ({ ...m, key: mappingKey(m) }));
      }
      // A receipt deduplicates history only. Safe activation still runs after reset.
      if (previous && activeSession?.handoverId === digest) return { already: true, count: previous.count, activated: true };
      const stamp = now();
      if (!previous) for (const row of rows) {
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
        if (!masters.some(x => x.active !== false && x.key === value.key)) {
          const inactive = masters.find(x => x.key === value.key);
          if (inactive) s.masters.put({ ...inactive, active: true, supersededAt: null, supersededBy: null });
          else s.masters.add({ ...value, id: uid(), active: true, createdAt: stamp, importId: digest });
        }
      }
      if (!previous) s.imports.add({ id: digest, count: rows.length, at: stamp, metadata, decisions, ...(handover ? { source, session: handover.session } : {}) });
      if (handover) s.settings.put({ id: 'session', value: { ...handover.session, handoverId: digest, activationId: uid(), savedAt: stamp } });
      s.settings.put({ id: 'lastHandover', value: digest });
      s.audit.add({ id: uid(), action: previous ? 'handover-activate' : 'import', importId: digest, count: rows.length, at: stamp, decisions, supersededMasterIds: superseded.map(m => m.id), ...(previous ? { before: activeSession, after: handover.session } : {}) });
      return { already: !!previous, count: rows.length, activated: !!handover };
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
      assertBusinessNumbers(await request(s.records.getAll()));
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
  if (value.startNumber !== undefined && (!Number.isSafeInteger(value.startNumber) || value.startNumber < 1 || value.startNumber > value.nextNumber)) throw Error('Nomor awal sesi backup rusak.');
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
        if (row.numberingSession !== undefined && (typeof row.numberingSession !== 'string' || !row.numberingSession || !row.ritaseNumber)) throw Error('Metadata penomoran backup rusak.');
        if (row.actualDate != null) calendarDate(row.actualDate);
        assertRecord(row.sourceSnapshot, { allowUnknownChecker: row.origin === 'import' });
        if (!['local', 'import'].includes(row.origin) || !Number.isInteger(row.revision) || row.revision < 1 || !validStamp(row.createdAt) || (normalizeTime(row.sourceTime) === null && !validTime(row.sourceTime))) throw Error('Metadata record backup rusak.');
      }
      if (n === 'masters' && mappingErrors(row).length) throw Error('Master backup rusak.');
      if (n === 'settings' && row.id === 'session') {
        validSession(row.value);
      }
      if (n === 'settings' && row.id === 'draft') {
        const d = row.value;
        if (!d || typeof d.id !== 'string' || !d.id || !d.values || !validTime(d.sourceTime) || (d.editId ? !Number.isInteger(d.revision) : typeof d.recordId !== 'string')) throw Error('Metadata draft backup rusak.');
        if (d.timeMode !== undefined && !['auto', 'manual'].includes(d.timeMode)) throw Error('Mode waktu draft rusak.');
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
      if (n === 'audit' && (!validStamp(row.at) || !['create', 'correct', 'delete', 'master', 'import', 'dismiss-destination', 'session-checker', 'renumber', 'session-end', 'session-reset', 'handover-activate'].includes(row.action))) throw Error('Log audit backup rusak.');
      if (n === 'audit' && row.action === 'session-reset') {
        calendarDate(row.session?.operationDate);
        if (!['DS', 'NS'].includes(row.session.shift) || !['BDM', 'ONI'].includes(row.session.scale) || !Number.isSafeInteger(row.deletedCount) || row.deletedCount < 0) throw Error('Audit reset sesi rusak.');
      }
      if (n === 'imports' && (!/^[a-f0-9]{64}$/.test(row.id) || !validStamp(row.at) || !Number.isInteger(row.count) || row.count < 1)) throw Error('Receipt impor backup rusak.');
    }
  }
  assertBusinessNumbers(b.stores.records);
  return total;
}

// No index/schema migration: the records read/write lock serializes tabs and number allocation.
export function assertBusinessNumbers(records) {
  const seen = new Set();
  for (const r of records) if (r.ritaseNumber !== undefined) {
    const key = JSON.stringify([r.operationDate, r.scale, r.ritaseNumber]);
    if (seen.has(key)) throw Error('Nomor ritase ganda pada tanggal/timbangan yang sama.');
    seen.add(key);
  }
}
export function planNumbering(all, candidate, session) {
  const scope = r => r.origin === 'local' && r.operationDate === session.operationDate && r.scale === session.scale && r.shift === session.shift && r.numberingSession === session.handoverId;
  if (all.some(r => r.origin === 'local' && r.operationDate === session.operationDate && r.scale === session.scale && r.shift === session.shift && r.numberingSession !== session.handoverId)) throw Error('Histori sesi bertumpang tindih; rekonsiliasi menunggu OD-05/OD-06.');
  const current = all.filter(scope);
  if (current.some(r => r.deletedAt)) throw Error('Sesi memiliki penghapusan; kebijakan gap menunggu OD-02.');
  if (current.length && session.startNumber === undefined) throw Error('Nomor awal sesi existing belum terverifikasi (OD-05).');
  const startNumber = session.startNumber ?? session.nextNumber;
  if (!Number.isSafeInteger(startNumber) || startNumber < 1) throw Error('Nomor awal sesi tidak valid.');
  if (all.some(r => r.operationDate === session.operationDate && r.scale === session.scale && !r.ritaseNumber)) throw Error('Histori tanpa nomor bertumpang tindih; migrasi menunggu OD-05.');
  if ([...current].sort((a,b) => a.ritaseNumber - b.ritaseNumber).some((r,i) => r.ritaseNumber !== startNumber + i)) throw Error('Urutan nomor sesi rusak; rekonsiliasi diperlukan.');
  const records = [...current.filter(r => r.id !== candidate.id), candidate];
  if (session.shift === 'NS') {
    const nextDate = new Date(calendarDate(session.operationDate).getTime() + 86400000).toISOString().slice(0, 10);
    if (records.some(r => ![session.operationDate, nextDate].includes(r.actualDate))) throw Error('BLOCKED: tanggal aktual transaksi NS belum terverifikasi (OD-10). Gunakan waktu perangkat tanpa edit pada tanggal sesi; aturan tanggal koreksi belum disahkan.');
  }
  records.sort((a, b) => (session.shift === 'NS' ? a.actualDate.localeCompare(b.actualDate) : 0) || timeOrderKey(a.time).localeCompare(timeOrderKey(b.time)) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const stamp = now();
  const originals = new Map(all.map(r => [r.id, r]));
  const ids = new Set(records.map(r => r.id));
  const planned = records.map((r, i) => {
    const number = startNumber + i;
    if (!Number.isSafeInteger(number + 1)) throw Error('Nomor ritase di luar rentang aman.');
    return { ...r, ritaseNumber: number, ...(r.id !== candidate.id && r.ritaseNumber !== number ? { revision: r.revision + 1, updatedAt: stamp } : {}) };
  });
  assertBusinessNumbers([...all.filter(r => !ids.has(r.id)), ...planned]);
  return { records: planned.filter(r => r.id === candidate.id || originals.get(r.id)?.ritaseNumber !== r.ritaseNumber), startNumber, nextNumber: startNumber + records.length };
}
