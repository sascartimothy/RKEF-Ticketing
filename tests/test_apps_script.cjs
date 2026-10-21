'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
const header=['destination_id','destination_name','is_active','source','created_at_utc','updated_at_utc','updated_by','request_id'];
const grid=[header, ['DST-001','ZHN LINE 25',true,'EXCEL_NAME_SHEET','','','',''], ['DST-002','ZTEN LINE 01','TRUE','EXCEL_NAME_SHEET','','','',''], ['DST-003','INACTIVE LINE',false,'SHEET_UI','','','','']];
let locks=0, unlocks=0, flushes=0, uuidCounter=0;
const sheet={
  getLastRow:()=>grid.length,
  getRange:(row,col,numRows,numCols)=>({getValues:()=>grid.slice(row-1,row-1+numRows).map(r=>r.slice(col-1,col-1+numCols))}),
  appendRow:row=>{grid.push(row);return sheet;}
};
const context={
  SpreadsheetApp:{openById:id=>{assert.equal(id,'1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE');return {getSheetByName:name=>name==='MASTER_DESTINATION'?sheet:null}},flush:()=>{flushes++;}},
  LockService:{getScriptLock:()=>({waitLock:()=>{locks++;},releaseLock:()=>{unlocks++;}})},
  Utilities:{getUuid:()=>`mock-uuid-${++uuidCounter}`},
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
