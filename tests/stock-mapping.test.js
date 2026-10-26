import test from 'node:test';
import assert from 'node:assert/strict';
import { stockPairs, stockTarget, resolveProduct, mappingErrors } from '../js/master-data.js';
import { inspectHandover } from '../js/wa-parser.js';
import { exportLine } from '../js/wa-exporter.js';
const stock = {id:'s',kind:'stock',stockpile:'SS_14',pileId:'S14_39',sourceCode:''};
const p = {id:'p',kind:'product',productCode:'5',dome:'SCZ-1190',destination:'ZHN LINE 26'};
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
test('Product Code resolves exact Dome/Destination uniquely, never from a name or unrelated destination', () => {
  assert.equal(resolveProduct(p.dome,p.destination,[p]).productCode,'5');
  assert.equal(resolveProduct(p.dome,'UNKNOWN',[p]),null);
  assert.equal(resolveProduct(p.dome,p.destination,[p,{...p,id:'p2',productCode:'8'}]),null);
  assert.equal(resolveProduct(p.dome,p.destination,[p,{...p,productCode:'8',active:false}]).productCode,'5');
});
test('old and new numbered WA import retain audit source; new export has exactly eleven fields, blanks 3/6', () => {
  for (const source of ['6','']) {
    const line=['46315-001','SAP_820',source,'SS_14','S14_39','','5','SCZ-1190','ZHN LINE 26','7.2','BDM'].join('\t');
    const parsed=inspectHandover(line); assert.equal(parsed.valid,true);assert.equal(parsed.rows[0].record.sourceCode,source);
    const r=parsed.rows[0].record, snapshot=structuredClone(r), columns=exportLine(r).split('\t');
    assert.equal(columns.length,11);assert.equal(columns[2],'');assert.equal(columns[5],'');assert.equal(columns[6],'5');
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
