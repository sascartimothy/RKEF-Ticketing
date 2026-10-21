import test from 'node:test';
import assert from 'node:assert/strict';
import { DestinationBridge, endpointURL, refreshDestinationCache, validateList } from '../docs/js/apps-script-api.js';
const url='https://script.google.com/macros/s/test_endpoint/exec';
const req='pwa_0123456789abcdef';
const row={destination_id:'DST-test',destination_name:'TEST DESTINATION',request_id:req};
const response = values=>({ok:true,count:values.length,destinations:values});
const sleep=async()=>{};
test('only existing GET health/list and form Destination payload',async()=>{
  let written=false,posted;
  const bridge=new DestinationBridge(url,{sleep,get:async(u,a)=>{assert.equal(u,url);return a==='health'?{ok:true,service:'RKEF_DESTINATION',version:'0.9.0'}:response(written?[row]:[]);},post:(...args)=>{posted=args;written=true;}});
  assert.equal((await bridge.health()).version,'0.9.0');
  assert.equal((await bridge.add('TEST DESTINATION',req)).found.request_id,req);
  assert.deepEqual(posted,[url,'TEST DESTINATION',req]);
});
test('opaque POST never creates false success; bounded retries',async()=>{
  let reads=0,posts=0;
  const bridge=new DestinationBridge(url,{sleep,get:async()=>{reads++;return response([]);},post:()=>{posts++;}});
  await assert.rejects(()=>bridge.add('TEST DESTINATION',req),/BELUM TERVERIFIKASI/);
  assert.equal(posts,1);assert.equal(reads,6);
});
test('retry same ID reads success before posting; duplicate name with wrong ID not success',async()=>{
  let posts=0;
  const bridge=new DestinationBridge(url,{sleep,get:async()=>response([row]),post:()=>posts++});
  await bridge.add(row.destination_name,req);assert.equal(posts,0);
  await assert.rejects(()=>bridge.add(row.destination_name,'pwa_different_0123456'),/sudah ada/);
  await assert.rejects(()=>bridge.verify(row.destination_name,'pwa_different_0123456',2),/BELUM TERVERIFIKASI/);
});
test('read retry limited and invalid schema never overwrites cache',async()=>{
  let attempts=0;
  const bridge=new DestinationBridge(url,{sleep,get:async()=>{attempts++;throw Error('offline');}});
  await assert.rejects(()=>bridge.list(),/offline/);assert.equal(attempts,2);
  const cached={id:'destinations',values:[row],syncedAt:'old'};let writes=0;
  const db={get:async()=>cached,put:async()=>writes++};
  const result=await refreshDestinationCache(db,bridge);
  assert.equal(result.cache,cached);assert.equal(result.stale,true);assert.equal(writes,0);
  const fresh=await refreshDestinationCache(db,{list:async()=>[row]});
  assert.equal(fresh.stale,false);assert.equal(writes,1);assert.notEqual(fresh.cache.syncedAt,'old');
});
test('cache write failure stays an error; previous cache retained',async()=>{
  const result=await refreshDestinationCache({put:async()=>{throw Error('quota');},get:async()=>({syncedAt:'old'})},{list:async()=>[row]});
  assert.equal(result.stale,true);assert.equal(result.error.message,'quota');assert.equal(result.cache.syncedAt,'old');
});
test('bad response, duplicate rows, formula, endpoints, and request IDs rejected',async()=>{
  for(const data of [{ok:false,code:'SERVER_ERROR'},response([row,row]),response([{...row,destination_name:'=BAD'}]),{ok:true,count:99,destinations:[]}])assert.throws(()=>validateList(data));
  assert.throws(()=>endpointURL('https://example.com/exec'));
  const bridge=new DestinationBridge(url,{sleep,get:async()=>response([]),post:()=>assert.fail('must not POST')});
  await assert.rejects(()=>bridge.add('=FORMULA',req));
  await assert.rejects(()=>bridge.add('VALID NAME','bad'));
});
