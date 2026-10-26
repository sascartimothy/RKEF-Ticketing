'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
const header=['destination_id','destination_name','is_active','source','created_at_utc','updated_at_utc','updated_by','request_id'];
const grid=[header, ['DST-001','ZHN LINE 25',true,'EXCEL_NAME_SHEET','','','',''], ['DST-002','ZTEN LINE 01','TRUE','EXCEL_NAME_SHEET','','','',''], ['DST-003','INACTIVE LINE',false,'SHEET_UI','','','','']];
const checkerGrid=[['Nama','checker_id','is_active','updated_at_utc','revision','request_id']];
const checkerSheet={getLastRow:()=>checkerGrid.length,getRange:(row,col,n,m)=>({getValues:()=>checkerGrid.slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+m)),setValues:values=>{checkerGrid[row-1]=values[0];}}),appendRow:row=>checkerGrid.push(row)};
let locks=0, unlocks=0, flushes=0, uuidCounter=0;
const sheet={
  getLastRow:()=>grid.length,
  getRange:(row,col,numRows,numCols)=>({getValues:()=>grid.slice(row-1,row-1+numRows).map(r=>r.slice(col-1,col-1+numCols))}),
  appendRow:row=>{grid.push(row);return sheet;}
};
const context={
  SpreadsheetApp:{openById:id=>{assert.equal(id,'1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE');return {getSheetByName:name=>name==='MASTER_DESTINATION'?sheet:name==='Checker_Crew'?checkerSheet:null}},flush:()=>{flushes++;}},
  LockService:{getScriptLock:()=>({waitLock:()=>{locks++;},releaseLock:()=>{unlocks++;}})},
  Utilities:{getUuid:()=>`mock-uuid-${++uuidCounter}`,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value,charset)=>[...crypto.createHash(algorithm).update(value,charset).digest()]},
  ContentService:{MimeType:{JAVASCRIPT:'javascript',JSON:'json'},createTextOutput(text){return {text,setMimeType(type){this.mime=type;return this;}}}},
  HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput(html){return {html,setXFrameOptionsMode(mode){this.mode=mode;return this;}}}},
  console
};
vm.createContext(context);vm.runInContext(source,context);
const get = parameter => context.doGet({parameter});
const post = parameter => context.doPost({parameter});
assert.equal(JSON.parse(get({action:'health'}).text).ok,true);
const list=JSON.parse(get({action:'list'}).text);
assert.equal(list.count,2,'only active rows');
assert.equal(list.destinations[0].destination_name,'ZHN LINE 25');
assert.equal(get({action:'health',callback:'_rkef_test'}).text.startsWith('_rkef_test('),true);
assert.equal(get({action:'health',callback:'alert(1)'}).mime,'json','reject unsafe JSONP callback');
const req='client_0123456789abcdef0123456789';
let html=post({action:'addDestination',name:'  NEW   DESTINATION   12  ',request_id:req});
assert.equal(html.mode,'ALLOWALL');
assert.equal(grid.length,5);
assert.equal(grid.at(-1)[1],'NEW DESTINATION 12');
assert.equal(grid.at(-1)[7],req);
assert.equal(JSON.parse(get({action:'list'}).text).count,3);
assert.ok(html.html.includes('CREATED'));
html=post({action:'addDestination',name:'NEW DESTINATION 12',request_id:req});
assert.equal(grid.length,5,'retry same request idempotent');
assert.ok(html.html.includes('ALREADY_APPLIED'));
html=post({action:'addDestination',name:'new destination 12',request_id:'client_abcdef0123456789abcdef01234'});
assert.equal(grid.length,5,'same name new request rejected');
assert.ok(html.html.includes('DUPLICATE_NAME'));
html=post({action:'addDestination',name:'=IMPORTXML()',request_id:'client_abcdef0123456789abcdef01234'});
assert.ok(html.html.includes('INVALID_NAME'));
assert.equal(grid.length,5,'no formulas written');
html=post({action:'addDestination',name:'NEXT LINE',request_id:'bad'});
assert.ok(html.html.includes('INVALID_REQUEST_ID'));
assert.equal(locks,unlocks,'lock always released');
assert.equal(flushes,1,'only actual creation flushed');
const r=JSON.parse(get({action:'list'}).text).destinations.find(x=>x.request_id===req);
assert.ok(r&&r.destination_name==='NEW DESTINATION 12','request id supports read-back confirmation');
console.log('PASS 12 integration contract assertions (Google services mocked)');

const snapshot=()=>JSON.parse(get({action:'listCheckers'}).text);
const checkerReq={action:'addChecker',name:'TEST CHECKER',expected_version:snapshot().list_version,request_id:'chk_test_0123456789'};
assert.ok(post({...checkerReq,name:'BAD\nNAME'}).html.includes('INVALID_NAME'));
assert.ok(post(checkerReq).html.includes('"ok":true'),'anonymous add without access credential');
assert.equal(checkerGrid.length,2); const checkerId=checkerGrid[1][1];
assert.ok(post(checkerReq).html.includes('ALREADY_APPLIED'));
assert.equal(checkerGrid.length,2);
assert.ok(post({...checkerReq,name:'DIFFERENT NAME'}).html.includes('REQUEST_ID_REUSE'));
assert.ok(post({...checkerReq,request_id:'chk_other_0123456789',expected_version:snapshot().list_version,name:'test checker'}).html.includes('DUPLICATE_NAME'));
assert.ok(post({...checkerReq,name:'STALE ADD',request_id:'chk_staleadd_0123456789'}).html.includes('VERSION_CONFLICT'));
const edit={action:'editChecker',checker_id:checkerId,name:'EDITED CHECKER',expected_version:snapshot().list_version,request_id:'chk_edit_0123456789'};
assert.ok(post(edit).html.includes('"ok":true'));
assert.ok(post({...edit,name:'STALE CHECKER',request_id:'chk_stale_0123456789'}).html.includes('VERSION_CONFLICT'));
assert.ok(post(checkerReq).html.includes('VERSION_CONFLICT'),'old add retry cannot duplicate an edited row');
const read=JSON.parse(get({action:'checkerStatus',checker_id:checkerId}).text);
assert.equal(read.revision,2); assert.equal(read.request_id,edit.request_id); assert.equal(read.name,edit.name);
assert.equal(JSON.parse(get({action:'checkerStatus',request_id:edit.request_id}).text).checker_id,checkerId);
assert.equal(snapshot().count,1);assert.deepEqual(Object.keys(snapshot().checkers[0]),['checker_id','name','revision','request_id']);
assert.ok(post({...edit,action:'deleteChecker',expected_version:snapshot().list_version,request_id:'chk_delete_0123456789'}).html.includes('"ok":true'));
assert.equal(checkerGrid.length,2,'soft delete retains row');assert.equal(checkerGrid[1][2],false);
assert.equal(snapshot().count,0);
assert.equal(JSON.parse(get({action:'checkerStatus',checker_id:checkerId}).text).revision,3);
assert.equal(JSON.parse(get({action:'checkerStatus',request_id:'chk_missing_0123456789'}).text).code,'NOT_FOUND');
assert.equal(locks,unlocks);
assert.ok(!/PropertiesService|checkerWriteAuthorized_|write_key/.test(source),'no Checker authorization code remains');
console.log('PASS anonymous Checker six-column schema, list token, stable ID, revision, validation, duplicate, request retry/reuse, conflict, flat status read-back and soft delete (Google services mocked)');
