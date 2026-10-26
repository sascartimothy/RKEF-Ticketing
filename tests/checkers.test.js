import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckerBridge, normalizeCheckers, checkerText, checkerName, validateCheckers, validateCheckerRequest, checkerError } from '../js/checkers.js';
const url='https://script.google.com/macros/s/test_endpoint/exec', token='a'.repeat(64), newer='b'.repeat(64);
const row={checker_id:'CHK-test-12345',name:'TEST CHECKER',revision:1,request_id:'chk_0123456789abcdef'};
const payload={action:'addChecker',name:row.name,expected_version:token,request_id:row.request_id};
const list=(rows,version=token)=>({ok:true,count:rows.length,list_version:version,checkers:rows});
test('deterministic multi-checker serialization, legacy fallback and invalid input',()=>{
 assert.equal(checkerText({checker:'LEGACY'}),'LEGACY');assert.throws(()=>checkerText({checkers:{},checker:'LEGACY'}));
 const a={checker_id:'b',name:'Name B'},b={checker_id:'a',name:'Name A'};
 assert.equal(checkerText({checkers:[a,b]}),'Name A; Name B');assert.deepEqual(normalizeCheckers([a,b]),[b,a]);
 for(const name of ['', '=BAD','+BAD','<script>','Name\nBad','@BAD'])assert.throws(()=>checkerName(name));
 assert.throws(()=>normalizeCheckers([a,a]));assert.throws(()=>normalizeCheckers([a,{...b,name:'Name B'}]));
});
test('live revision rows without is_active validate; previous version cache remains readable',()=>{
 assert.equal(validateCheckers(list([row]))[0].is_active,true);
 assert.throws(()=>validateCheckers(list([{...row,revision:0}])));
 assert.throws(()=>validateCheckers({ok:false,code:'UNKNOWN_ACTION'}));
 assert.equal(validateCheckers(list([{...row,revision:undefined,version:1}]),{legacyCache:true})[0].revision,1);
 assert.throws(()=>validateCheckers(list([{...row,revision:undefined,version:1}])));
});
test('anonymous exact POST fields, assigned ID, flat status and fresh list verify add edit delete',async()=>{
 let current=null,version=token,posted=[];
 const bridge=new CheckerBridge(url,{sleep:async()=>{},post:(u,p)=>{posted.push(p);current={checker_id:current?.checker_id||row.checker_id,name:p.name||current.name,is_active:p.action!=='deleteChecker',revision:(current?.revision||0)+1,request_id:p.request_id};version=newer;},get:async(u,a,t,p)=>a==='checkerStatus'?current&&(p.checker_id===current.checker_id||p.request_id===current.request_id)?{ok:true,...current,list_version:version}:{ok:false,code:'NOT_FOUND'}:list(current?.is_active?[current]:[],version)});
 assert.equal((await bridge.mutate(payload)).values.length,1);
 assert.deepEqual(Object.keys(posted[0]).sort(),['action','name','request_id','expected_version'].sort());
 const edit={...payload,checker_id:row.checker_id,action:'editChecker',name:'EDITED CHECKER',expected_version:newer,request_id:'chk_edit_0123456789'};
 assert.equal((await bridge.mutate(edit)).values[0].name,edit.name);
 assert.deepEqual((await bridge.mutate({action:'deleteChecker',checker_id:row.checker_id,expected_version:newer,request_id:'chk_delete_0123456789'})).values,[]);
 assert.equal(current.is_active,false);assert.equal(current.checker_id,row.checker_id);assert.ok(posted.every(p=>!('write_key' in p)));
});
test('opaque POST without read-back cannot succeed; retry keeps ID and verifies before posting',async()=>{
 let stored=false,posts=0;
 const bridge=new CheckerBridge(url,{sleep:async()=>{},post:()=>{posts++;},get:async(u,a)=>a==='checkerStatus'?stored?{ok:true,...row,is_active:true,list_version:token}:{ok:false,code:'NOT_FOUND'}:list(stored?[row]:[])});
 await assert.rejects(()=>bridge.mutate(payload),/BELUM TERVERIFIKASI/);assert.equal(posts,1);
 stored=true;assert.equal((await bridge.mutate(payload)).values[0].request_id,payload.request_id);assert.equal(posts,1);
});
test('stale list token and duplicate names are rejected before any write',async()=>{
 for(const [data,code] of [[list([],newer),'VERSION_CONFLICT'],[list([{...row,request_id:'peer'}]),'DUPLICATE_NAME']]){
  const bridge=new CheckerBridge(url,{sleep:async()=>{},post:()=>assert.fail('unexpected POST'),get:async(u,a)=>a==='checkerStatus'?{ok:false,code:'NOT_FOUND'}:data});
  await assert.rejects(()=>bridge.mutate(payload),e=>e.code===code);
 }
});
test('backend error codes stay explicit; POST success alone remains insufficient',async()=>{
 for(const code of ['VERSION_CONFLICT','DUPLICATE_NAME','INVALID_NAME','REQUEST_ID_REUSE']){
  const bridge=new CheckerBridge(url,{sleep:async()=>{},post:(u,p,reply)=>reply({ok:false,code,request_id:p.request_id}),get:async(u,a)=>a==='checkerStatus'?{ok:false,code:'NOT_FOUND'}:list([])});
  await assert.rejects(()=>bridge.mutate(payload),e=>e.code===code);
 }
 assert.equal(checkerError('REQUEST_ID_REUSE').code,'REQUEST_ID_REUSE');
});
test('network error, wrong read-back, concurrent change and extra POST fields are rejected',async()=>{
 for(const data of [{ok:true,...row,name:'WRONG',is_active:true,list_version:token},{ok:true,...row,is_active:true,list_version:newer}]){
  const bridge=new CheckerBridge(url,{sleep:async()=>{},get:async(u,a)=>a==='checkerStatus'?data:list([row])});
  await assert.rejects(()=>bridge.verify(payload));
 }
 const bridge=new CheckerBridge(url,{get:async()=>{throw Error('offline');},post:()=>assert.fail('no POST on failed preflight')});
 await assert.rejects(()=>bridge.mutate(payload),/offline/);
 assert.throws(()=>validateCheckerRequest({...payload,checker_id:row.checker_id}));
 assert.throws(()=>validateCheckerRequest({...payload,write_key:'removed'}));
});

test('malformed status remains uncertain; request ID reuse is explicit, never a new write',async()=>{
 for(const reply of [{ok:true},{ok:true,...row,is_active:true,list_version:'broken'}]){
  const bridge=new CheckerBridge(url,{get:async()=>reply,post:()=>assert.fail('unexpected POST')});
  await assert.rejects(()=>bridge.mutate(payload),e=>e.code==='SCHEMA');
 }
 const bridge=new CheckerBridge(url,{get:async()=>({ok:true,...row,name:'ANOTHER NAME',is_active:true,list_version:token}),post:()=>assert.fail('unexpected POST')});
 await assert.rejects(()=>bridge.mutate(payload),e=>e.code==='REQUEST_ID_REUSE');
});
