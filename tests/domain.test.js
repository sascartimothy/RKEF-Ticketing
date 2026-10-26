import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { excelSerial, dateFromSerial, validTime, localTime, normalizeTime } from '../js/time-date.js';
import { parseWA, sourceDigest, inspectHandover } from '../js/wa-parser.js';
import { exportLine, exportWA, potentialDuplicates, filterRecords } from '../js/wa-exporter.js';
import { validateRecord } from '../js/validation.js';
import { conflicts, deriveMappings, mappingKey } from '../js/master-data.js';
import { validateBackup, STORES } from '../js/database.js';
const columns = ['46315','SAP_1014','6','TS_13','L20_S71','','5','SCZ-1189','ZHN LINE 25','06.59','BDM'];
const line = columns.join('\t');
const record = { ...parseWA(line)[0].record, id: 'one', checker: 'TEST CHECKER', shift: 'Day', origin: 'local' };
test('Report TSV blanks Source/reserved columns and preserves imported audit metadata', () => {
  assert.equal(exportLine(record), columns.map((v,i)=>[2,6].includes(i)?'':v).join('\t'));
  assert.equal(exportLine(record).split('\t').length, 11);
  assert.equal(parseWA(exportLine(record))[0].errors.length, 0);
  assert.deepEqual(parseWA(exportLine(record))[0].record, {...parseWA(line)[0].record,sourceCode:'',productCode:''});
  assert.equal(parseWA(line)[0].record.sourceCode,'6');
  assert.equal(exportWA([record, {...record, deletedAt:'now'}]), columns.map((v,i)=>[2,6].includes(i)?'':v).join('\t'));
});
test('legacy numbered 10-column mapping is explicit and retains raw source', () => {
  const legacy = ['46315-001', ...columns.slice(1,5), ...columns.slice(6)].join('\t');
  const p = parseWA(legacy)[0];
  assert.equal(p.raw, legacy); assert.equal(p.legacy, true); assert.equal(p.errors.length, 0); assert.ok(p.warnings.length);
  assert.equal(exportLine(p.record), columns.map((v,i)=>i===0?'46315-001':[2,6].includes(i)?'':v).join('\t'));
  assert.equal(p.record.sourceCode,'6');
});
test('bad column count, missing empty TAB, bad time and serial are rejected without editing', () => {
  for (const malformed of [line.replace('\t\t','\t'), line.replace('06.59','52.00,0'), line.replace('46315','46315-00x'), line.replace('46315','60'), line.replace('46315','9999999'), line+'\t', line.replace('SAP_1014',' SAP_1014'), columns.map((v,i)=>i===5?'x':v).join('\t')]) {
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
    const result=execFileSync(process.execPath,['--input-type=module','-e',"import {excelSerial} from './js/time-date.js'; console.log(excelSerial('2026-10-20'))"],{env:{...process.env,TZ:zone},encoding:'utf8'}).trim();
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
  assert.equal(potentialDuplicates({...record,id:'new-format',productCode:'',sourceCode:''},[record]).length,1);
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
test('legacy numeric mapping variants do not block current pairs or replace local entries', () => {
  const masters = deriveMappings([record],[]).map(m=>({...m,id:m.kind,key:mappingKey(m)}));
  assert.equal(deriveMappings([record],masters).length,0);
  const altered={...record,sourceCode:'99',productCode:'99'};
  const derived=deriveMappings([altered],masters);
  assert.equal(derived.length,2); assert.equal(derived[0].conflicts.length,0); assert.equal(derived[1].conflicts.length,0);
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

const numberedLine = (n, scale = 'BDM', serial = 46315) => [ `${serial}-${String(n).padStart(3, '0')}`, ...columns.slice(1, 10), scale ].join('\t');
test('whole eleven-column numbered handover detects DS to NS and NS to next-date DS, independent of time', () => {
  const ds = inspectHandover(Array.from({length:83}, (_,i)=>numberedLine(i+1)).join('\n'));
  assert.equal(ds.valid, true); assert.equal(ds.session.operationDate, '2026-10-20');
  assert.equal(ds.session.shift, 'NS'); assert.equal(ds.session.nextRitase, '46315-084');
  assert.equal(ds.rows[82].record.ritaseNumber,83); assert.equal(ds.session.checker,'');
  const ns = inspectHandover(Array.from({length:67}, (_,i)=>numberedLine(i+84)).join('\n'));
  assert.equal(ns.valid,true); assert.equal(ns.session.operationDate,'2026-10-21');
  assert.equal(ns.session.shift,'DS'); assert.equal(ns.session.nextRitase,'46316-001');
  assert.equal(inspectHandover(numberedLine(999)).session.nextRitase,'46316-001');
  assert.equal(inspectHandover(Array.from({length:1000},(_,i)=>numberedLine(i+1)).join('\n')).session.nextRitase,'46315-1001');
  assert.equal(inspectHandover(numberedLine(1,'ONI')).session.nextRitase,'46315-002');
});
test('whole handover blocks mixed scales, mixed dates, gaps, duplicates, order, old formats and invalid time without editing source', () => {
  for(const source of [numberedLine(1)+'\n'+numberedLine(2,'ONI'), numberedLine(1)+'\n'+numberedLine(2,'BDM',46316), numberedLine(1)+'\n'+numberedLine(3), numberedLine(2)+'\n'+numberedLine(1), numberedLine(1)+'\n'+numberedLine(1), line, numberedLine(1).replace('\t\t','\t'), numberedLine(1).replace('06.59','7.6'), numberedLine(0), numberedLine(1).replace('46315','60')]) {
    const result=inspectHandover(source); assert.equal(result.valid,false,source); assert.equal(result.session,null,source);
    assert.equal(result.rows.map(r=>r.raw).join('\n'),source);
  }
  const mixed=Array.from({length:83},(_,i)=>numberedLine(i+1,i===82?'ONI':'BDM')).join('\n');
  assert.equal(inspectHandover(mixed).rows.filter(r=>r.errors.some(e=>e.includes('Campuran'))).length,83);
});

test('new handover session metadata survives backup validation without inventing a checker', () => {
  const session=inspectHandover(numberedLine(1)).session;
  const backup={application:'RKEF_TICKETING',version:1,stores:Object.fromEntries(STORES.map(n=>[n,[]]))};
  backup.stores.settings=[{id:'session',value:session}];assert.equal(validateBackup(backup),1);
  backup.stores.settings[0].value={...session,nextRitase:'FAKE'};assert.throws(()=>validateBackup(backup),/Metadata/);
  assert.ok(validateRecord({...record,ritaseNumber:0}).length);
});

test('owner time notation normalizes meaning and retains source for audit', () => {
  const samples = {'7.2':'07.20','7.20':'07.20','7.23':'07.23','8.2':'08.20','10.3':'10.30','13.3':'13.30','15':'15.00','15.00':'15.00','16.4':'16.40','10.03':'10.03','0.0':'00.00','23.59':'23.59'};
  for (const [source, expected] of Object.entries(samples)) {
    assert.equal(normalizeTime(source),expected);
    const text=numberedLine(1).replace('06.59',source), report=inspectHandover(text);
    assert.equal(report.valid,true,text); assert.equal(report.rows[0].record.time,expected);
    assert.equal(report.rows[0].sourceTime,source); assert.equal(report.rows[0].raw,text);
  }
  for (const source of ['24','24.00','7.6','7.60','7.234','-1','7,2','7:20','7.',' 7.2','7.2\n']) assert.equal(normalizeTime(source),null,source);
});


test('second precision validation, legacy draft modes and backup remain compatible', async () => {
  const { localTimeSeconds, timePrecision, draftTimeMode } = await import('../js/time-date.js');
  assert.equal(localTimeSeconds(new Date(2026,9,21,14,25,59)),'14.25.59');
  for (const value of ['00.00.00','23.59.59','14.25.12']) { assert.ok(validTime(value));assert.equal(timePrecision(value),'second'); }
  assert.equal(timePrecision('14.25'),'minute');
  for (const value of ['14.25.60','24.00.00','14.25.1','14.25.00\n','14.25\n']) assert.equal(validTime(value),false);
  assert.equal(draftTimeMode({sourceTime:'14.25',values:{time:'14.25'}}),'auto');
  assert.equal(draftTimeMode({sourceTime:'14.25',values:{time:'14.20'}}),'manual');
  assert.equal(draftTimeMode({timeMode:'manual',sourceTime:'14.25',values:{time:'14.25'}}),'manual');
  const row={...record,time:'14.25.59',timePrecision:'second',timeMode:'auto',sourceTime:'14.25.59',sourceSnapshot:{...record,time:'14.25.59'},revision:1,createdAt:'2026-10-21T00:00:00Z'};
  const backup={application:'RKEF_TICKETING',version:1,stores:Object.fromEntries(STORES.map(n=>[n,n==='records'?[row]:[]]))};
  assert.equal(validateBackup(backup),1);
  assert.equal(inspectHandover(numberedLine(1).replace('06.59','14.25.59')).valid,false);
});
