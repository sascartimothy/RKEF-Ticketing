import test from 'node:test';
import assert from 'node:assert/strict';
import { stockPairs, stockTarget, resolveProduct, mappingErrors } from '../js/master-data.js';
import { inspectHandover } from '../js/wa-parser.js';
import { exportLine } from '../js/wa-exporter.js';
import { stockIdentityErrors } from '../js/validation.js';
const stock = {id:'s',kind:'stock',stockpile:'SS_14',pileId:'S14_39',sourceCode:''};
const p = {id:'p',kind:'product',productCode:'5',dome:'SCZ-1190',destination:'ZHN LINE 26'};

test('all 22 official stockpiles and 29 pile examples pass popup naming rules; new codes are allowed', () => {
  const stocks = 'BR-C_05 DS-C_04 DS-C_05B DS-C_10 LS_02 LS_06 LS_09 LS_20 LS_28 LS_30 LS_31 LS_32 LS_33 LS_39 LS_41 LS_42 LS_44 LS_45 SS_06 SS_11 SS_14 SS_16'.split(' ');
  const piles = 'BR-C2_S02 BR-C3B_S14 BR-C6D_S16 DS-C4_L12 DS-C5B_L01 DS-C10_L09 C3A_S04 C3B_S07 C6D_S11 C10_S08 GT1_L01 L1_S18 L2_39 L6_308 L6_S42 L28_28 L37B_S10 L45_S03 SLNC_S01 Eppe_S01 S1J_03 S3_110 S6_PL01 S6A_L74 S6B_L20 S6D_L10 S14_L14 S14_43 S16_L02'.split(' ');
  assert.equal(stocks.length,22); assert.equal(piles.length,29);
  for (const stockpile of [...stocks,'LS_46']) for (const pileId of [...piles,'S99_PL123']) assert.deepEqual(stockIdentityErrors({stockpile,pileId}),{},`${stockpile}/${pileId}`);
  assert.deepEqual(stockIdentityErrors({stockpile:' SS_14 ',pileId:' Eppe_S02 '}),{});
});

test('naming errors identify the exact field, reject case/separator/prefix/incomplete names without coercion', () => {
  for (const stockpile of ['SS-14','SS14','LS 02','BR_C_05','DS-C05','ss_14','TS_14','LS_1','SS_','DS-C_05BB','SS_140','SS_14\nX','']) {
    assert.deepEqual(Object.keys(stockIdentityErrors({stockpile,pileId:'S14_38'})),['stockpile'],stockpile);
  }
  for (const pileId of ['S14-38','S1438','L6 308','BR_C2_S02','S6-PL01','S14_','s14_38','EPPE_S01','X1_S01','GT1A_L01','S100_S01','S6_PL1','S6_PL1234','']) {
    assert.deepEqual(Object.keys(stockIdentityErrors({stockpile:'SS_14',pileId})),['pileId'],pileId);
  }
});

test('legacy exemption is per unchanged field only; handover and frozen exports keep legacy identities', () => {
  for (const stockpile of ['TS_14','TS_15','C_02']) {
    const legacy = {stockpile,pileId:'LEGACY_PILE'};
    assert.deepEqual(stockIdentityErrors({...legacy,dome:'NEW',destination:'NEW'},legacy),{});
    assert.deepEqual(stockIdentityErrors({...legacy,pileId:'S6_PL01'},legacy),{});
    assert.deepEqual(stockIdentityErrors({...legacy,stockpile:'LS_46'},legacy),{});
    assert.ok(stockIdentityErrors({...legacy,stockpile:'TS_16'},legacy).stockpile);
    assert.ok(stockIdentityErrors({...legacy,pileId:'BAD'},legacy).pileId);
    const raw = ['46315-001','SAP_820','6',stockpile,legacy.pileId,'','5',p.dome,p.destination,'7.2','BDM'].join('\t');
    const parsed=inspectHandover(raw); assert.equal(parsed.valid,true);
    assert.deepEqual(mappingErrors({kind:'stock',...legacy}),[]);
    assert.equal(exportLine(parsed.rows[0].record).split('\t')[3],stockpile);
    assert.equal(parsed.rows[0].raw,raw);
  }
});
test('local pair has no required Source Code; stable unique pair list and optional metadata validation', () => {
  assert.deepEqual(mappingErrors(stock),[]);
  assert.deepEqual(stockPairs([stock,{...stock,id:'dup',sourceCode:'6'},{...stock,id:'gone',active:false}]),[stock]);
  assert.ok(mappingErrors({...stock,sourceCode:'bad\tvalue'}).length);
});
test('target only comes from same pair and import provenance; explicit edit supersedes frozen source', () => {
  const records = [{...stock,...p,origin:'import',importId:'one'},{...stock,...p,pileId:'OTHER',dome:'OTHER',origin:'import'}];
  const target = {dome:p.dome,destination:p.destination};
  assert.deepEqual(stockTarget({...stock,importId:'one'},[stock],records),target);
  assert.equal(stockTarget(stock,[stock],[...records,{...records[0],destination:'OTHER'}]),null);
  assert.deepEqual(stockTarget(stock,[{...stock,...target}],records),target);
  assert.equal(stockTarget(stock,[stock],records.filter(r=>r.pileId==='OTHER')),null);
});
test('Column-8 Product Code resolves exact Destination independently of legacy numeric variants', () => {
  assert.equal(resolveProduct(p.dome,p.destination,[p]).productCode,'5');
  assert.equal(resolveProduct(p.dome,'UNKNOWN',[p]),null);
  assert.equal(resolveProduct(p.dome,p.destination,[p,{...p,id:'p2',productCode:'8'}]),p);
  assert.equal(resolveProduct(p.dome,p.destination,[p,{...p,productCode:'8',active:false}]).productCode,'5');
});
test('old and new numbered WA import retain audit source; new export has exactly eleven fields, blanks 3/6/7', () => {
  for (const source of ['6','']) for (const legacyCode of ['5','']) {
    const line=['46315-001','SAP_820',source,'SS_14','S14_39','',legacyCode,'SCZ-1190','ZHN LINE 26','7.2','BDM'].join('\t');
    const parsed=inspectHandover(line); assert.equal(parsed.valid,true);assert.equal(parsed.rows[0].record.sourceCode,source);
    const r=parsed.rows[0].record, snapshot=structuredClone(r), columns=exportLine(r).split('\t');
    assert.equal(columns.length,11);assert.equal(columns[2],'');assert.equal(columns[5],'');assert.equal(columns[6],'');assert.equal(columns[7],p.dome);assert.equal(columns[8],p.destination);
    assert.deepEqual(r,snapshot);assert.equal(parsed.rows[0].raw,line);
  }
});

test('reused master identity resolves target from latest approved handover, not its original import', () => {
  const m={...stock,importId:'old'};
  const history=[{...stock,...p,origin:'import',importId:'old'},{...stock,...p,destination:'NEW DEST',origin:'import',importId:'latest'}];
  assert.deepEqual(stockTarget(m,[m],history,'latest'),{dome:p.dome,destination:'NEW DEST'});
  assert.equal(stockTarget(m,[m],history,'missing'),null);
  assert.deepEqual(stockTarget(m,[m,{...m,id:'local',dome:'LOCAL',destination:'LOCAL DEST'}],history,'latest'),{dome:'LOCAL',destination:'LOCAL DEST'});
});

test('new mapping/record need column 8 and Destination only; legacy metadata stays optional and validated', () => {
  assert.deepEqual(mappingErrors({...p,productCode:''}),[]);
  assert.deepEqual(mappingErrors({kind:'product',dome:p.dome,destination:p.destination}),[]);
  assert.ok(mappingErrors({...p,dome:''}).length);
  assert.ok(mappingErrors({...p,destination:''}).length);
  assert.ok(mappingErrors({...p,productCode:'bad\tvalue'}).length);
});
