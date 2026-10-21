import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { excelSerial, dateFromSerial, validTime, localTime } from '../src/js/time-date.js';
import { parseWA, sourceDigest } from '../src/js/wa-parser.js';
import { exportLine, exportWA, potentialDuplicates, filterRecords } from '../src/js/wa-exporter.js';
import { validateRecord } from '../src/js/validation.js';
import { conflicts, deriveMappings, mappingKey } from '../src/js/master-data.js';
import { validateBackup, STORES } from '../src/js/database.js';
const columns = ['46315','SAP_1014','6','TS_13','L20_S71','','5','SCZ-1189','ZHN LINE 25','06.59','BDM'];
const line = columns.join('\t');
const record = { ...parseWA(line)[0].record, id: 'one', checker: 'TEST CHECKER', shift: 'Day', origin: 'local' };
test('exact requested eleven-column TSV, empty sixth column, and round trip', () => {
  assert.equal(exportLine(record), line);
  assert.equal(exportLine(record).split('\t').length, 11);
  assert.equal(parseWA(exportLine(record))[0].errors.length, 0);
  assert.deepEqual(parseWA(exportLine(record))[0].record, parseWA(line)[0].record);
  assert.equal(exportWA([record, {...record, deletedAt:'now'}]), line);
});
test('legacy numbered 10-column mapping is explicit and retains raw source', () => {
  const legacy = ['46315-001', ...columns.slice(1,5), ...columns.slice(6)].join('\t');
  const p = parseWA(legacy)[0];
  assert.equal(p.raw, legacy); assert.equal(p.legacy, true); assert.equal(p.errors.length, 0); assert.ok(p.warnings.length);
  assert.equal(exportLine(p.record), line);
});
test('bad column count, missing empty TAB, bad time and serial are rejected without editing', () => {
  for (const malformed of [line.replace('\t\t','\t'), line.replace('06.59','52.00,0'), line.replace('46315','46315-001'), line.replace('46315','60'), line.replace('46315','9999999'), line+'\t', line.replace('SAP_1014',' SAP_1014'), columns.map((v,i)=>i===5?'x':v).join('\t')]) {
    const p = parseWA(malformed)[0]; assert.ok(p.errors.length, malformed); assert.equal(p.raw, malformed);
  }
  assert.equal(parseWA(line+'\n\n'+line).filter(r=>r.errors.length).length,1);
  assert.equal(parseWA(line+'\r\n')[0].errors.length,0);
});
test('Excel calendar serial deterministic, leap dates, and timezone independent', () => {
  assert.equal(excelSerial('2026-10-20'),46315); assert.equal(dateFromSerial(46315),'2026-10-20');
  for (const d of ['1900-01-01','1900-02-28','1900-03-01','2024-02-29','2026-12-31','9999-12-31']) assert.equal(dateFromSerial(excelSerial(d)),d);
  for (const bad of ['2026-02-29','2026-13-01','2026-10-2','1899-12-31']) assert.throws(()=>excelSerial(bad));
  for (const zone of ['UTC','Asia/Makassar','America/Los_Angeles']) {
    const result=execFileSync(process.execPath,['--input-type=module','-e',"import {excelSerial} from './src/js/time-date.js'; console.log(excelSerial('2026-10-20'))"],{env:{...process.env,TZ:zone},encoding:'utf8'}).trim();
    assert.equal(result,'46315');
  }
});
test('time validation strict and device clock default', () => {
  assert.ok(validTime('00.00')); assert.ok(validTime('23.59'));
  for(const t of ['24.00','6.59','06:59','06.60',' 06.59','06.59\n']) assert.equal(validTime(t),false);
  const d = new Date(2026,9,21,23,45); assert.equal(localTime(d),'23.45');
});
test('duplicate detection uses full TSV, permits same DT on separate trips', () => {
  assert.equal(potentialDuplicates({...record,id:'two'},[record]).length,1);
  assert.equal(potentialDuplicates({...record,id:'two',time:'07.00'},[record]).length,0);
  assert.equal(parseWA(line+'\n'+line)[1].warnings.some(w=>w.startsWith('Potensi')),true);
  assert.equal(parseWA(line,[record])[0].warnings.some(w=>w.startsWith('Potensi')),true);
});
test('report origin filters keep historical handover separate', () => {
  const history={...record,id:'import',origin:'import'};
  assert.equal(filterRecords([record,history],{origin:'local'}).length,1);
  assert.equal(filterRecords([record,history],{origin:'import',dome:'SCZ-1189'}).length,1);
  assert.equal(filterRecords([record],{stockpile:'wrong'}).length,0);
});
test('mapping conflicts flagged without replacing local entries', () => {
  const masters = deriveMappings([record],[]).map(m=>({...m,id:m.kind,key:mappingKey(m)}));
  assert.equal(deriveMappings([record],masters).length,0);
  const altered={...record,sourceCode:'99',productCode:'99'};
  const derived=deriveMappings([altered],masters);
  assert.equal(derived.length,2); assert.ok(derived.every(m=>m.conflicts.length===1));
  assert.equal(masters[0].sourceCode,'6');
  assert.equal(conflicts(derived[0],masters.map(m=>({...m,active:false}))).length,0);
});
test('required validation and source whitespace are never silently normalized', () => {
  assert.equal(validateRecord(record).length,0);
  assert.ok(validateRecord({...record,checker:''}).length);
  assert.ok(validateRecord({...record,dtNo:'bad\tvalue'}).length);
  assert.ok(validateRecord({...record,note:'bad\nvalue'}).length);
});
test('SHA256 import receipt stable for newline conventions, distinct source stays distinct', async () => {
  assert.equal(await sourceDigest(line+'\r\n'),await sourceDigest(line));
  assert.notEqual(await sourceDigest(line+'\n'+line),await sourceDigest(line));
});
test('backup schema, IDs, record snapshots, and store names validated', () => {
  const backup={application:'RKEF_TICKETING',version:1,stores:Object.fromEntries(STORES.map(n=>[n,[]]))};
  assert.equal(validateBackup(backup),0);
  assert.throws(()=>validateBackup({...backup,version:99}));
  backup.stores.records=[{...record,revision:1,createdAt:'2026-10-21T00:00:00Z',sourceTime:'06.59',sourceSnapshot:{...record}}];
  assert.equal(validateBackup(backup),1);
  backup.stores.records.push({...backup.stores.records[0]}); assert.throws(()=>validateBackup(backup),/duplikat/);
});
