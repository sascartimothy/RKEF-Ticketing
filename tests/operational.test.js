import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDT } from '../js/validation.js';
import { planNumbering, assertBusinessNumbers } from '../js/database.js';
import { exportLine, potentialDuplicates } from '../js/wa-exporter.js';
import { normalizeManualTime, normalizeTime, timePrecision } from '../js/time-date.js';

test('manual numeric shorthand normalizes without changing the WA source grammar', () => {
  for (const [raw, expected] of Object.entries({720:'07.20', '0720':'07.20',72035:'07.20.35','072035':'07.20.35',1425:'14.25',142530:'14.25.30',2359:'23.59',235959:'23.59.59','7.2':'07.20','7.20':'07.20','13.3':'13.30','14.25':'14.25','14.25.30':'14.25.30',15:'15.00',0:'00.00','000000':'00.00.00'})) {
    assert.equal(normalizeManualTime(raw),expected,raw);
    assert.equal(timePrecision(expected),expected.length === 8 ? 'second' : 'minute');
  }
  for (const raw of ['', ' ', '24', '2400', '760', '1260', '235960', '1234567', '07.', '7..2', '7:20', ' 720', '720 ', 'abc']) assert.equal(normalizeManualTime(raw),null,raw);
  assert.equal(normalizeTime('720'),null);
});
const session = { operationDate: '2026-10-20', scale: 'BDM', shift: 'DS', handoverId: 'session', startNumber: 84, nextNumber: 87 };
const record = (id,time,number) => ({ id, time, ritaseNumber:number, operationDate:session.operationDate, scale:'BDM', shift:'DS', checker:'TEST', origin:'local', numberingSession:'session', dtNo:'SAP_'+id, sourceCode:'6',stockpile:'TEST',pileId:'PILE',productCode:'5',dome:'DOME',destination:'DEST',createdAt:'2026-10-20T00:00:00Z',revision:1 });
test('DT numeric SAP prefix, full and other prefixes, legacy identity preservation and invalid values', () => {
  assert.equal(normalizeDT('820'),'SAP_820'); assert.equal(normalizeDT('SAP_820'),'SAP_820');
  assert.equal(normalizeDT('OTHER_820'),'OTHER_820'); assert.equal(normalizeDT('OLD-820','OLD-820'),'OLD-820');
  for(const value of ['',' 820','820 ','SAP_SAP_820','-12','82.0'])assert.throws(()=>normalizeDT(value));
});
test('Option B correction follows time, preserving UUID, source and frozen scopes', () => {
  const rows=[record('820','15.20',84),record('817','15.25',85),record('1039','15.30',86)];
  const frozen=[{...record('import','12.00',83),origin:'import'}, {...record('ONI','15.22',85),scale:'ONI'}, {...record('date','15.22',85),operationDate:'2026-10-19'}];
  const original=structuredClone([...rows,...frozen]);
  const result=planNumbering([...rows,...frozen],{...rows[2],time:'15.22'},session);
  assert.deepEqual(result.records.map(r=>[r.id,r.ritaseNumber]),[['1039',85],['817',86]]);
  assert.deepEqual([...rows,...frozen],original); assert.equal(result.nextNumber,87);
});
test('earlier insert, deterministic equal times and numbers above 999', () => {
  const a=record('a','15.20',84), b=record('b','15.20',85), c=record('c','15.19');
  const positions = result => result.records.map(r => [r.id, r.ritaseNumber]);
  assert.deepEqual(positions(planNumbering([b,a],c,session)),positions(planNumbering([a,b],c,session)));
  const result=planNumbering([],c,{...session,startNumber:1000});assert.equal(result.records[0].ritaseNumber,1000);assert.equal(result.nextNumber,1001);
});
test('collisions, unknown historic numbering, deleted and incompatible session records block', () => {
  const candidate=record('new','15.20');
  for(const rows of [[{...record('import','12.00',84),origin:'import'}],[{...record('old','12.00'),numberingSession:null}],[{...record('deleted','12.00',84),deletedAt:'now'}]])assert.throws(()=>planNumbering(rows,candidate,session));
  assert.throws(()=>assertBusinessNumbers([record('a','12.00',84),record('b','12.00',84)]));
});
test('NS actual calendar dates order midnight; ambiguous dates are blocked', () => {
  const ns={...session,shift:'NS'};
  const a={...record('a','23.50',84),shift:'NS',actualDate:'2026-10-20'},b={...record('b','00.30'),shift:'NS',actualDate:'2026-10-21'};
  const result=planNumbering([a],b,ns);assert.equal(result.records.find(r=>r.id==='b').ritaseNumber,85);
  assert.throws(()=>planNumbering([a],{...b,actualDate:null},ns),/BLOCKED/);
  assert.throws(()=>planNumbering([a],{...b,actualDate:'2026-10-22'},ns),/BLOCKED/);
});
test('export uses stored business number and duplicate checks ignore sequence', () => {
  const a=record('820','15.20',84);
  assert.equal(exportLine(a).split('\t')[0],'46315-084');
  assert.equal(potentialDuplicates({...a,id:'other',ritaseNumber:85},[a]).length,1);
});


test('seconds order and correction renumber UUIDs; minute observations tie stably at .00', () => {
  const rows = [record('820','14.25.12',84),record('817','14.25.38',85),record('1039','14.25.51',86)];
  assert.deepEqual(planNumbering(rows,{...rows[2],time:'14.25.20'},session).records.map(r=>[r.id,r.ritaseNumber]),[['1039',85],['817',86]]);
  const a=record('a','14.25',84), b=record('b','14.25.00',85), c=record('c','14.25.00');
  const plan=rows=>planNumbering(rows,c,session).records.map(r=>[r.id,r.ritaseNumber]);
  assert.deepEqual(plan([a,b]),plan([b,a]));
  assert.equal(planNumbering(rows,{...record('early','14.25.01')},session).records[0].id,'early');
});

test('WA truncates seconds without rollover or mutation; duplicate identity retains seconds', () => {
  for (const [time,minute] of [['07.20.01','07.20'],['10.03.45','10.03'],['14.25.59','14.25'],['23.59.59','23.59']]) {
    const row=record('820',time,84), original=structuredClone(row), columns=exportLine(row).split('\t');
    assert.equal(columns.length,11);assert.equal(columns[5],'');assert.equal(columns[9],minute);assert.equal(columns[0],'46315-084');assert.deepEqual(row,original);
  }
  assert.equal(potentialDuplicates({...record('820','14.25.12'),id:'other'},[record('820','14.25.38')]).length,0);
});
