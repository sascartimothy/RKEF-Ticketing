(async()=>{
 const {Database}=await import('./js/database.js'), {state}=await import('./js/state.js');
 const {CheckerBridge,checkerText,submitChecker}=await import('./js/checkers.js');
 const {renderCheckers}=await import('./js/checker-ui.js');
 const db=await Database.open(), baseline=await db.backup(), oldDraft=structuredClone(state.draft);
 const $=s=>document.querySelector(s), assert=(v,m)=>{if(!v)throw Error(m);};
 const wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}throw Error('Checker UI timeout: '+$('#checker-feedback').textContent+' '+$('#checker-error').textContent);};
 const baseSession=structuredClone(state.session);
 // Inspect the actual form transport without sending any live request.
 const nativeSubmit=HTMLFormElement.prototype.submit;let postedForm,replies=[];
 HTMLFormElement.prototype.submit=function(){postedForm={method:this.method,fields:Object.fromEntries(new FormData(this)),target:this.target};};
 const transportPayload={action:'addChecker',name:'TEST TRANSPORT',request_id:'chk_transport_0123456789',expected_version:'a'.repeat(64)};
 let dispose;
 try{dispose=submitChecker(window.RKEF_CONFIG.appsScriptUrl,transportPayload,r=>replies.push(r));}finally{HTMLFormElement.prototype.submit=nativeSubmit;}
 assert(postedForm.method==='post'&&JSON.stringify(postedForm.fields)===JSON.stringify(transportPayload),'anonymous form payload');
 const msg=(origin,id)=>window.dispatchEvent(new MessageEvent('message',{origin,data:{kind:'RKEF_CHECKER_RESULT',payload:{ok:false,code:'INVALID_NAME',request_id:id}}}));
 msg('https://example.invalid',transportPayload.request_id);msg('https://script.googleusercontent.com','wrong');assert(!replies.length,'unrelated iframe reply accepted');
 msg('https://script.googleusercontent.com',transportPayload.request_id);assert(replies.length===1,'matching error reply missed');dispose();
 const originalList=CheckerBridge.prototype.list,originalMutate=CheckerBridge.prototype.mutate;
 let rows=[{checker_id:'CHK-test-alpha',name:'TEST ALPHA',is_active:true,revision:1,request_id:''},{checker_id:'CHK-test-beta',name:'TEST BETA',is_active:true,revision:1,request_id:''}],posts=0,fail=false,dropAfterPost=false,generation=1,rejectCode='';
 const token=()=>String(generation).padStart(64,'0');
 const fake=new CheckerBridge(window.RKEF_CONFIG.appsScriptUrl,{sleep:async()=>{},get:async(u,a,t,p)=>{
   if(fail)throw Error('TEST network failure');
   if(a==='checkerStatus'){
     const row=rows.find(r=>r.request_id===p.request_id)||(p.checker_id&&rows.find(r=>r.checker_id===p.checker_id));
     return row?{ok:true,...structuredClone(row),list_version:token()}:{ok:false,code:'NOT_FOUND'};
   }
   return {ok:true,count:rows.filter(r=>r.is_active).length,list_version:token(),checkers:structuredClone(rows.filter(r=>r.is_active))};
 },post:(u,p,reply)=>{
   posts++; assert(!('write_key' in p),'unexpected credential field');assert(p.expected_version===token(),'optimistic list version');
   if(rejectCode){reply({ok:false,code:rejectCode,request_id:p.request_id});return;}
   const old=rows.find(r=>r.checker_id===p.checker_id);
   const row={checker_id:old?.checker_id||'CHK-fake-row-'+posts,name:p.name||old.name,is_active:p.action!=='deleteChecker',revision:(old?.revision||0)+1,request_id:p.request_id};
   if(old)rows[rows.indexOf(old)]=row;else rows.push(row);
   generation++; if(dropAfterPost)fail=true;
 }});
 CheckerBridge.prototype.list=function(){return originalList.call(fake);};
 CheckerBridge.prototype.mutate=function(p){return originalMutate.call(fake,p);};
 const originalVerify=CheckerBridge.prototype.verify;
 CheckerBridge.prototype.verify=function(...args){return originalVerify.apply(fake,args);};
 try {
  location.hash='setup'; await wait(()=>!$('#view-setup').hidden);
  $('#sync-checkers').click();await wait(()=>!$('#sync-checkers').disabled);
  assert(state.checkerCache.values.length===2,'sync cache count');
  const records=await db.all('records');
  state.session={...baseSession,checker:'TEST ALPHA'};delete state.session.checkers;
  $('#choose-checkers').click();assert($('#checker-body').querySelectorAll('input:checked').length===1,'legacy name matched twice');
  $('#checker-cancel').click();state.session=structuredClone(baseSession);

  $('#choose-checkers').click();assert($('#checker-dialog').open,'checklist opens');
  const boxes=[...$('#checker-body').querySelectorAll('input')];boxes.forEach(b=>b.checked=Number(b.dataset.index)<2);
  $('#checker-cancel').click();assert(JSON.stringify(state.session)===JSON.stringify(baseSession),'cancel changed session');
  $('#choose-checkers').click();[...$('#checker-body').querySelectorAll('input')].forEach(b=>b.checked=Number(b.dataset.index)<2);
  $('#checker-ok').click();await wait(()=>!$('#checker-dialog').open);
  assert(state.session.checkers.length===2&&state.session.checker==='TEST ALPHA; TEST BETA','multi-select saved');
  assert(state.session.nextNumber===baseSession.nextNumber&&state.session.activationId===baseSession.activationId,'selection changed numbering/session');
  assert(JSON.stringify(await db.all('records'))===JSON.stringify(records),'selection rewrote records');assert(posts===0,'selection wrote Sheets');
  const {renderReport}=await import('./js/report-ui.js');renderReport();assert($('#report-session').textContent.includes('TEST ALPHA; TEST BETA'),'report multi-checker');
  // Dirty draft preserved across an atomic session update, stale tabs rejected.
  const active=structuredClone(state.session);
  const draft={...structuredClone(state.draft),session:active,dirty:true};
  if(draft.id){await db.saveDraft(draft);await db.saveCheckers([active.checkers[0]],active);assert((await db.get('settings','draft')).value.values.dtNo===draft.values.dtNo,'draft input lost');
    let rejected=false;try{await db.saveCheckers([],active);}catch{rejected=true;}assert(rejected,'stale session selection accepted');
    // Restore test session before UI actions.
    await db.put('settings',{id:'session',value:active});await db.put('settings',{id:'draft',value:draft});}
  $('#edit-checkers').click();$('#add-checker').click();$('#checker-name').value='TEST ALPHA';$('#checker-ok').click();await wait(()=>!$('#checker-ok').disabled);assert(!$('#checker-error').hidden&&posts===0,'duplicate accepted');
  $('#checker-name').value='TEST GAMMA';$('#checker-ok').click();await wait(()=>!!$('#add-checker')&&!state.checkerPending&&!$('#checker-cancel').disabled);
  assert(posts===1&&state.checkerCache.values.length===3,'add not verified');assert(!$('#checker-body input[type=password]'),'unexpected password input');
  $('#checker-body [data-edit="0"]').click();$('#checker-name').value='TEST ALPHA RENAMED';$('#checker-ok').click();await wait(()=>!!$('#add-checker')&&!state.checkerPending&&!$('#checker-cancel').disabled);
  assert(state.checkerCache.values[0].name==='TEST ALPHA RENAMED','edit cache');assert(checkerText(state.session)==='TEST ALPHA; TEST BETA','master renamed session snapshot');
  $('#checker-body [data-delete="1"]').click();$('#checker-ok').click();await wait(()=>!!$('#add-checker')&&!state.checkerPending&&!$('#checker-cancel').disabled);
  assert(state.checkerCache.values.length===2&&!rows[1].is_active,'soft delete');assert(state.session.checkers.length===2,'delete changed selection');$('#checker-cancel').click();
  // Ambiguous network outcome persists request and reopens the same recovery controls.
  $('#edit-checkers').click();$('#add-checker').click();$('#checker-name').value='TEST RETRY';dropAfterPost=true;
  const beforeRetryCache=structuredClone(state.checkerCache);$('#checker-ok').click();await wait(()=>!!$('#verify-checker')&&!$('#checker-cancel').disabled);
  const pending=await db.get('pending','checker');assert(pending&&state.checkerPending.payload.request_id===pending.payload.request_id,'pending ID not durable');
  assert(JSON.stringify(state.checkerCache)===JSON.stringify(beforeRetryCache),'uncertain write changed cache');
  const priorPosts=posts;fail=false;dropAfterPost=false;$('#checker-cancel').click();$('#edit-checkers').click();
  $('#retry-checker').click();await wait(()=>!state.checkerPending&&!$('#checker-cancel').disabled);
  assert(posts===priorPosts,'retry posted again despite matching receipt');assert(state.checkerCache.values.some(r=>r.name==='TEST RETRY'),'retry read-back not cached');
  // Remote version conflict reloads master, keeps session snapshots, and requires review.
  $('#checker-body [data-edit="0"]').click();$('#checker-name').value='CONFLICTED NAME';generation++;
  const beforeConflictPosts=posts;$('#checker-ok').click();await wait(()=>!$('#checker-ok').disabled&&!state.checkerPending);
  assert(posts===beforeConflictPosts&&$('#checker-error').textContent.includes('berubah'),'stale mutation not rejected');
  assert(state.checkerCache.listVersion===token(),'version conflict did not refresh master');
  for(const code of ['DUPLICATE_NAME','INVALID_NAME','REQUEST_ID_REUSE']){
    $('#add-checker').click();$('#checker-name').value='TEST REJECTED '+code;rejectCode=code;$('#checker-ok').click();
    await wait(()=>!!$('#add-checker')&&!$('#checker-cancel').disabled&&!state.checkerPending);
    assert(!$('#checker-error').hidden,'backend '+code+' missing feedback');
  }
  rejectCode='';$('#checker-cancel').click();
  const cache=structuredClone(state.checkerCache);fail=true;$('#sync-checkers').click();await wait(()=>!$('#sync-checkers').disabled);assert(JSON.stringify(state.checkerCache)===JSON.stringify(cache),'failure erased cache');
  const descriptor=Object.getOwnPropertyDescriptor(navigator,'onLine');
  Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
  try {renderCheckers();$('#choose-checkers').click();assert($('#checker-dialog').open,'offline checklist');$('#checker-cancel').click();$('#edit-checkers').click();$('#add-checker').click();$('#checker-name').value='TEST OFFLINE';const before=posts;$('#checker-ok').click();await wait(()=>!$('#checker-ok').disabled);assert(posts===before&&$('#checker-error').textContent.includes('Offline'),'offline mutation sent');$('#checker-cancel').click();$('#checker-cancel').click();}
  finally {if(descriptor)Object.defineProperty(navigator,'onLine',descriptor);else delete navigator.onLine;}
  assert(document.documentElement.scrollWidth<=innerWidth,'360px overflow');
  assert(JSON.stringify(await db.all('records'))===JSON.stringify(records),'master management changed records');
  const oldRecord=records.find(r=>r.origin==='local'&&!r.deletedAt&&r.numberingSession===state.session.handoverId&&r.activationId===state.session.activationId);
  if(oldRecord){
    const corrected=await db.saveRecord({...oldRecord,note:'Checker snapshot correction test'},{expectedRevision:oldRecord.revision});
    assert(corrected.checker===oldRecord.checker&&JSON.stringify(corrected.checkers)===JSON.stringify(oldRecord.checkers),'correction changed historic Checker');
    assert(JSON.stringify(corrected.sourceSnapshot)===JSON.stringify(oldRecord.sourceSnapshot),'correction changed source snapshot');
  }
  const stable=await db.snapshot(),txn= db.transaction;
  db.transaction=function(names,mode,work){return txn.call(this,names,mode,async stores=>{const result=await work(stores);if(mode==='readwrite'&&names.includes('audit'))throw Error('TEST checker transaction abort');return result;});};
  try{let rejected=false;try{await db.saveCheckers([],state.session);}catch{rejected=true;}assert(rejected,'checker abort not rejected');}finally{db.transaction=txn;}
  assert(JSON.stringify(await db.snapshot())===JSON.stringify(stable),'checker abort changed database');
  return 'PASS Checker real DOM checklist OK/Cancel, multi-select, no session/number/history changes, dirty draft atomicity, stale tab rejection, Report names, anonymous add/edit/soft-delete read-back, same-ID retry, backend rejection codes, conflict refresh, duplicate, failed sync cache, offline selection/write block and 360px';
 } finally {
  CheckerBridge.prototype.list=originalList;CheckerBridge.prototype.mutate=originalMutate;CheckerBridge.prototype.verify=originalVerify;
  await db.restore(baseline,'replace');db.db.close();state.session=baseSession;state.draft=oldDraft;
  state.checkerPending=baseline.stores.pending.find(p=>p.id==='checker')||null;state.checkerCache=baseline.stores.cache.find(c=>c.id==='checkers')||null;renderCheckers();
 }
})()
