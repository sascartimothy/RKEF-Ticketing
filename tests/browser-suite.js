(async () => {
  const results = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const equal = (a,b,msg) => assert(JSON.stringify(a)===JSON.stringify(b), `${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  const wait = ms=>new Promise(r=>setTimeout(r,ms));
  const until = async (fn,label) => { for(let i=0;i<160;i++){if(await fn())return;await wait(30);}throw Error('Timeout '+label); };
  const { Database, STORES } = await import('./js/database.js');
  const { state } = await import('./js/state.js');
  const { parseWA, sourceDigest } = await import('./js/wa-parser.js');
  const { deriveMappings, mappingKey } = await import('./js/master-data.js');
  const { DestinationBridge, submitDestination, jsonp } = await import('./js/apps-script-api.js');
  const { flushDraft } = await import('./js/operational-ui.js');
  await until(()=>state.ready,'app boot');
  const line=['46315','TEST_DT','6','TEST_STOCK','TEST_PILE','','5','TEST_DOME','TEST DESTINATION','06.59','TEST_SCALE'].join('\t');
  const data={...parseWA(line)[0].record,id:crypto.randomUUID(),shift:'Day',checker:'TEST CHECKER',origin:'local'};
  const name='rkef-test-'+crypto.randomUUID();
  const db=await Database.open(indexedDB,name);
  const first=await db.saveRecord(data,{draftId:'test-draft',sourceTime:'06.58'});
  assert(first.sourceSnapshot.time==='06.59','source snapshot');
  equal((await db.saveRecord(data,{draftId:'test-draft'})).id,first.id,'idempotent save retry');
  try{await db.saveRecord({...data,time:'06.00'},{draftId:'test-draft'});assert(false,'retry overwrote saved record');}catch(e){assert(e.message.includes('isi berbeda'),'changed retry error');}
  try{await db.saveRecord({...data,id:crypto.randomUUID()},{draftId:'duplicate'});assert(false,'unconfirmed duplicate stored');}catch(e){assert(e.message.includes('duplikat'),'transaction duplicate check');}
  const corrected=await db.saveRecord({...first,time:'07.01',note:'corrected'},{expectedRevision:1,draftId:'edit'});
  equal(corrected.sourceSnapshot.time,'06.59','immutable snapshot');equal(corrected.sourceTime,'06.58','source clock preserved');equal(corrected.editedTime,'07.01','edited time');
  try {await db.saveRecord({...first,time:'07.02'},{expectedRevision:1});assert(false,'stale revision allowed');}catch(e){assert(e.message.includes('berubah'),'stale correction error');}
  const audits=await db.all('audit');equal(audits.length,2,'create/correct audit');
  const before=await db.all('settings');
  try{await db.transaction(['settings'],'readwrite',s=>{s.settings.add({id:'atomic',value:1});s.settings.add({id:'atomic',value:2});});assert(false,'abort not raised');}catch{}
  equal(await db.all('settings'),before,'aborted transaction rolls back');
  const digest=await sourceDigest(line);
  const rows=parseWA(line), mappings=deriveMappings(rows.map(r=>r.record),[]).map(m=>({...m,key:mappingKey(m)}));
  const imported=await db.importHandover({digest,rows,mappings,metadata:{shift:'Night',checker:'TEST PREVIOUS'},decisions:{selectedLines:[1]}});
  equal(imported.count,1,'import count');assert((await db.importHandover({digest,rows,mappings,metadata:{shift:'Night',checker:'TEST PREVIOUS'},decisions:{}})).already,'idempotent import receipt');
  const backup=await db.backup();
  const second=await Database.open(indexedDB,name+'-restore');await second.restore(backup);await second.restore(backup);
  equal((await second.all('records')).length,2,'restore idempotence');
  equal((await second.get('records',first.id)).sourceSnapshot.time,'06.59','restored snapshot');
  const corrupt=structuredClone(backup);corrupt.stores.records[0].time='23.50';
  try{await second.restore(corrupt);assert(false,'conflicting merge allowed');}catch(e){assert(e.message.includes('Konflik'),'merge conflict error');}
  equal((await second.get('records',first.id)).time,'07.01','conflict rollback');
  await second.deleteRecord(first.id,2);equal((await second.get('records',first.id)).revision,3,'delete tombstone revision');
  assert((await second.all('audit')).some(a=>a.action==='delete'),'delete audited');
  await second.restore(backup,'replace');equal((await second.all('audit')).length,backup.stores.audit.length,'atomic replacement');
  const changedLine=line.replace('TEST_PILE','NEW_TEST_PILE');
  const changedRows=parseWA(changedLine),changedMaps=deriveMappings(changedRows.map(r=>r.record),await second.all('masters')).map(m=>({...m,key:mappingKey(m)}));
  await second.saveMaster({kind:'stock',stockpile:'LOCAL_STOCK',pileId:'LOCAL_PILE',sourceCode:'1',key:mappingKey({kind:'stock',stockpile:'LOCAL_STOCK',pileId:'LOCAL_PILE',sourceCode:'1'})});
  await second.importHandover({digest:await sourceDigest(changedLine),rows:changedRows,mappings:changedMaps,metadata:{shift:'Day',checker:'TEST'},decisions:{}});
  const updatedMasters=await second.all('masters');
  assert(updatedMasters.some(m=>m.pileId==='TEST_PILE'&&m.active===false),'prior handover not superseded');
  assert(updatedMasters.some(m=>m.pileId==='LOCAL_PILE'&&m.active===true),'local additions lost on latest handover');
  db.db.close();second.db.close();indexedDB.deleteDatabase(name);indexedDB.deleteDatabase(name+'-restore');
  results.push('PASS real IndexedDB atomic abort, snapshots, correction conflict, audit, delete, import idempotency, backup/restore');

  // Verify the actual DOM transport, without transmitting any network request.
  const originalSubmit=HTMLFormElement.prototype.submit;let posted;
  HTMLFormElement.prototype.submit=function(){posted={method:this.method,action:this.action,target:this.target,enctype:this.enctype,fields:Object.fromEntries(new FormData(this))};};
  try{submitDestination(window.RKEF_CONFIG.appsScriptUrl,'TEST DESTINATION','pwa_browser_0123456');}finally{HTMLFormElement.prototype.submit=originalSubmit;}
  equal(posted.method,'post','iframe POST method');equal(Object.keys(posted.fields).sort(),['action','name','request_id'],'POST privacy fields');
  assert(document.querySelector(`iframe[name="${posted.target}"]`),'form targets iframe');
  let timeoutError=false;try{await jsonp(window.RKEF_CONFIG.appsScriptUrl,'list',20);}catch{timeoutError=true;}assert(timeoutError,'JSONP failure visible');
  results.push('PASS real DOM form-encoded iframe transport and failing JSONP (all external requests blocked)');

  const $=s=>document.querySelector(s);
  const set=(form,values)=>{for(const [k,v] of Object.entries(values))if(form.elements[k])form.elements[k].value=v;};
  const input=el=>el.dispatchEvent(new Event('input',{bubbles:true}));
  const submit=selector=>$(selector).requestSubmit();
  const seedDb=await Database.open();
  await seedDb.saveMaster({kind:'stock',stockpile:'TEST_STOCK',pileId:'TEST_PILE',sourceCode:'6'});
  await seedDb.saveMaster({kind:'product',productCode:'5',dome:'TEST_DOME',destination:'TEST DESTINATION'});
  await seedDb.saveSession({operationDate:'2026-10-20',shift:'Day',scale:'TEST_SCALE',checker:'TEST CHECKER'});
  const signal=new BroadcastChannel('rkef-ticketing');signal.postMessage('changed');
  await until(()=>state.session?.scale==='TEST_SCALE','existing session load');
  equal([...document.querySelectorAll('#view-setup article h2')].map(e=>e.textContent),['Handover manual','Sesi operasional','Destination'],'Setup card order');
  equal(document.querySelectorAll('#view-setup article').length,4,'exactly four Setup cards');
  assert(!$('#master-form')&&!$('#session-form'),'removed editor references');
  assert(!$('#view-setup').textContent.includes('Sebelum mulai')&&!$('#view-setup').textContent.includes('Pilihan lokal'),'old cards remain');
  equal($('#app-version').textContent,'RKEF Ticketing — v1.1.0','version');
  const {applySessionFilter}=await import('./js/report-ui.js');applySessionFilter();
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden&&state.draft,'operation view');
  set($('#entry-form'),data);input($('#entry-form').elements.time);await flushDraft();
  submit('#entry-form');await until(()=>state.records.some(r=>r.dtNo==='TEST_DT'&&r.origin==='local'),'save UI');
  const saved=state.records.find(r=>r.dtNo==='TEST_DT');equal(saved.operationDate,'2026-10-20','operation date');equal(saved.time,'06.59','edited time saved');
  location.hash='report';await until(()=>!$('#view-report').hidden,'report view');
  equal($('#report-output').value,line,'UI exact TSV');equal($('#report-count').textContent,'1','UI summary count');
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'operation return');
  $(`[data-edit="${saved.id}"]`).click();await until(()=>state.draft?.editId===saved.id,'edit');
  set($('#entry-form'),{time:'07.05',note:'TEST CORRECTION'});input($('#entry-form').elements.time);await flushDraft();submit('#entry-form');
  await until(()=>$('#confirm-dialog').open,'correction confirm');$('#confirm-ok').click();
  await until(()=>state.records.find(r=>r.id===saved.id)?.revision===2,'correction save');
  equal(state.records.find(r=>r.id===saved.id).sourceSnapshot.time,'06.59','UI source preserved');
  equal($('#save-entry').textContent,'Simpan ritase','save button resets after correction');
  assert(!$('#confirm-dialog').open,'dialog closed');
  // Old and mixed reports remain visible and cannot activate a session or import subsets.
  location.hash='setup';await until(()=>!$('#view-setup').hidden,'setup validation');
  const paste = async source => {
    const el=$('#wa-source'); el.value=''; input(el);
    const event=new Event('paste',{bubbles:true,cancelable:true});
    if(el.dispatchEvent(event)){el.value=source;input(el);}
    assert(!el.dispatchEvent(new Event('paste',{bubbles:true,cancelable:true})), 'overlapping paste accepted');
    await until(()=>!$('#import-preview').hidden && !$('#import-preview').textContent.includes('Memproses'), 'automatic paste');
  };
  const originalSession=structuredClone(state.session), originalCount=state.records.length;
  const numbered=['46315-001','HANDOVER_TEST','6','TEST_STOCK','TEST_PILE','','5','TEST_DOME','TEST DESTINATION','06.59','ONI'].join('\t');
  for(const invalid of [line,numbered+'\n'+numbered.replace('46315-001','46315-002').replace('ONI','BDM'),numbered.replace('06.59','7.6')]) {
    await paste(invalid);
    assert($('#import-preview').classList.contains('danger'),'invalid report status');
    assert(!$('#confirm-import')&&!$('#preview-import'),'confirmation controls remain');
    equal(state.session,originalSession,'invalid preview changed session');equal(state.records.length,originalCount,'partial import');
  }
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'operational for draft');
  // Inject a storage failure and verify that the app keeps the draft and shows no saved row.
  const originalSave=Database.prototype.saveRecord;
  Database.prototype.saveRecord=async()=>{throw new DOMException('TEST quota exceeded','QuotaExceededError');};
  set($('#entry-form'),{...data,dtNo:'FAILED_TEST'});input($('#entry-form').elements.dtNo);await flushDraft();submit('#entry-form');
  await until(()=>!$('#entry-error').hidden,'storage failure feedback');
  assert(!state.records.some(r=>r.dtNo==='FAILED_TEST'),'false storage success');
  assert(state.draft.values.dtNo==='FAILED_TEST','draft lost on failed save');
  Database.prototype.saveRecord=originalSave;
  location.hash='setup';await until(()=>!$('#view-setup').hidden,'setup for pending');
  await until(()=>!$('#destination-form button').disabled,'destination idle');
  const originalAdd=DestinationBridge.prototype.add,originalVerify=DestinationBridge.prototype.verify;
  DestinationBridge.prototype.add=async()=>{throw Error('BELUM TERVERIFIKASI: TEST unconfirmed write');};
  $('#destination-form').elements.name.value='TEST SHARED DESTINATION';submit('#destination-form');
  await until(()=>$('#confirm-dialog').open,'cloud write confirmation');$('#confirm-ok').click();
  await until(()=>state.pending&&!!$('#verify-pending'),'pending persists');
  const appDb=await Database.open();
  assert((await appDb.get('pending','destination')).requestId===state.pending.requestId,'pending not durable before POST');
  const pendingId=state.pending.requestId;
  DestinationBridge.prototype.verify=async(name,id)=>{assert(id===pendingId,'pending request ID changed');const row={destination_id:'DST-SYNTHETIC',destination_name:name,request_id:id};return {found:row,values:[row]};};
  $('#verify-pending').click();await until(()=>!state.pending,'verified pending clears');
  assert((await appDb.get('cache','destinations')).values[0].request_id===pendingId,'verified cache missing');
  appDb.db.close();DestinationBridge.prototype.add=originalAdd;DestinationBridge.prototype.verify=originalVerify;
  // Dirty drafts block automatic activation.
  await paste(numbered);
  assert($('#import-preview').classList.contains('danger'),'dirty draft was replaced');
  equal(state.session,originalSession,'draft conflict changed session');
  await seedDb.transaction(['settings'],'readwrite',stores=>stores.settings.delete('draft'));state.draft=null;
  // Typing and restoring source values must never import.
  const fullReport=Array.from({length:83},(_,i)=>numbered.replace('46315-001',`46315-${String(i+1).padStart(3,'0')}`).replace('06.59',['7.2','7.20','7.23','8.2','10.3','13.3','15','15.00','16.4'][i%9])).join('\n');
  $('#wa-source').value=fullReport; input($('#wa-source')); await wait(60);
  equal(state.session,originalSession,'typing activated session');
  // Abort after import writes were queued: records, masters, receipt, audit and session must all roll back.
  const stableBeforeFailure=await seedDb.snapshot(), originalTransaction=Database.prototype.transaction;
  Database.prototype.transaction=function(names,mode,work){
    return originalTransaction.call(this,names,mode,async stores=>{
      const result=await work(stores);
      if(mode==='readwrite' && names.includes('imports')) throw Error('TEST handover storage failure');
      return result;
    });
  };
  try { await paste(fullReport); } finally { Database.prototype.transaction=originalTransaction; }
  assert($('#import-preview').classList.contains('danger'),'storage failure reported success');
  equal(await seedDb.snapshot(),stableBeforeFailure,'failed storage partially changed database');
  equal(state.session,originalSession,'failed storage activated session');
  await paste(fullReport);
  await until(()=>state.session?.handoverConfirmed,'handover activation');
  assert(!$('#confirm-dialog').open&&!$('#confirm-import')&&!$('#ack-complete')&&!$('#ack-mapping'),'handover required confirmation');
  assert(!$('.import-rows')&&!$('#detected-session')&&$('#import-preview').textContent.length<300,'long handover preview');
  assert($('#import-preview').textContent.includes('83 ritase'),'83-row status');
  equal(state.session.scale,'ONI','detected scale');equal(state.session.nextRitase,'46315-084','preparation number');
  assert(!state.session.ritaseNumber,'session allocated permanent number');
  assert(state.masters.some(m=>m.stockpile==='TEST_STOCK'&&m.origin==='local'),'local master lost');
  const importedRecord=state.records.find(r=>r.dtNo==='HANDOVER_TEST' && r.ritaseNumber===1);
  equal(importedRecord.ritaseNumber,1,'source sequence lost');equal(importedRecord.rawSource,fullReport.split('\n')[0],'source lost');equal(importedRecord.sourceTime,'7.2','raw time lost');equal(importedRecord.time,'07.20','time meaning changed');
  assert(!importedRecord.checker,'invented checker');
  const snapshotBefore=await seedDb.snapshot();
  await paste(fullReport);
  equal(await seedDb.snapshot(),snapshotBefore,'repeated paste changed database');
  assert((await seedDb.importHandover({source:fullReport})).already,'receipt not idempotent');
  equal(await seedDb.snapshot(),snapshotBefore,'repeated import reactivated or altered data');
  const restoreDb=await Database.open(indexedDB,'rkef-new-restore-'+crypto.randomUUID());
  await restoreDb.restore(await seedDb.backup());equal((await restoreDb.get('settings','session')).value.nextRitase,'46315-084','new session backup');restoreDb.db.close();
  const invalidMixed=numbered+'\n'+numbered.replace('46315-001','46315-002').replace('ONI','BDM');
  try{await seedDb.importHandover({source:invalidMixed,decisions:{complete:true}});assert(false,'mixed report stored');}catch(e){assert(e.message.includes('tidak valid'),'mixed error');}
  equal(await seedDb.snapshot(),snapshotBefore,'mixed report changed database');
  $('#checker-form').elements.checker.value='TEST CURRENT CHECKER';submit('#checker-form');
  await until(()=>state.session?.checker==='TEST CURRENT CHECKER','manual checker');
  equal((await seedDb.get('settings','session')).value.checker,'TEST CURRENT CHECKER','checker durability');
  assert(state.draft.session.checker==='TEST CURRENT CHECKER','draft checker stale');
  const nextSource=numbered.replace('46315-001','46315-084');
  await seedDb.put('settings',{id:'draft',value:{dirty:true}});
  try{await seedDb.importHandover({source:nextSource,decisions:{complete:true}});assert(false,'dirty draft overwritten');}catch(e){assert(e.message.includes('OD-06'),'draft conflict error');}
  await seedDb.transaction(['settings'],'readwrite',stores=>stores.settings.delete('draft'));
  await seedDb.importHandover({source:nextSource,decisions:{complete:true}});
  const nextSession=(await seedDb.get('settings','session')).value;
  equal(nextSession.shift,'DS','NS to DS');equal(nextSession.nextRitase,'46316-001','next operation date');
  signal.postMessage('changed');await until(()=>state.session?.shift==='DS','next shift refreshed');
  seedDb.db.close();signal.close();
  // New contract: independent preparation, atomic rollback, conflicts and concurrent receipt retries.
  const isolated=await Database.open(indexedDB,'rkef-handover-'+crypto.randomUUID());
  const handoverLine=(n,scale='BDM',serial=46315)=>numbered.replace('46315-001',`${serial}-${String(n).padStart(3,'0')}`).replace('ONI',scale);
  const complete=(count,scale)=>Array.from({length:count},(_,i)=>handoverLine(i+1,scale)).join('\n');
  const bdmSource=complete(83,'BDM');
  const retry=await Promise.all([isolated.importHandover({source:bdmSource,decisions:{complete:true}}),isolated.importHandover({source:bdmSource,decisions:{complete:true}})]);
  equal(retry.filter(r=>r.already).length,1,'concurrent retry receipt');equal((await isolated.all('records')).length,83,'retry duplicate rows');
  equal((await isolated.get('settings','session')).value.nextRitase,'46315-084','BDM preparation');
  await isolated.importHandover({source:complete(50,'ONI'),decisions:{complete:true}});
  equal((await isolated.get('settings','session')).value.nextRitase,'46315-051','ONI preparation');
  equal((await isolated.get('imports',await sourceDigest(bdmSource))).session.nextRitase,'46315-084','ONI altered BDM');
  const stable=await isolated.snapshot();
  for(const args of [
    {source:bdmSource.replace('HANDOVER_TEST','CHANGED_CONTENT'),decisions:{complete:true}},
    {source:handoverLine(84),decisions:{complete:true,expectedSession:null}},
    {source:handoverLine(84).replace('TEST_PILE','NEW_PILE'),decisions:{complete:true,supersededMasterIds:['STALE_MASTER']}},
    {source:handoverLine(1,'BDM',46314),decisions:{complete:true}}
  ]) {
    let blocked=false;try{await isolated.importHandover(args);}catch{blocked=true;}
    assert(blocked,'conflicting / stale handover accepted');equal(await isolated.snapshot(),stable,'failed handover was not atomic');
  }
  const beforeReplay=(await isolated.get('settings','session')).value;
  await isolated.importHandover({source:bdmSource,decisions:{complete:true}});
  equal((await isolated.get('settings','session')).value,beforeReplay,'old replay reactivated session');
  isolated.db.close();
  results.push('PASS Setup four cards, v1.1.0, complete numbered handover, automatic paste, concise status, manual checker, storage rollback, scale isolation, mixed rejection, idempotence, draft protection and backup compatibility');
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'return for final draft');
  set($('#entry-form'),{dtNo:'UNSAVED_TEST',time:'07.17'});input($('#entry-form').elements.time);await flushDraft();
  assert(document.documentElement.scrollWidth<=360,'360px layout overflows horizontally');
  await navigator.serviceWorker.ready;
  const registration = await navigator.serviceWorker.getRegistration();
  equal(registration.scope, location.origin + '/RKEF-Ticketing/', 'unchanged Pages worker scope');
  await until(()=>!!navigator.serviceWorker.controller,'service worker control');
  const cache=await caches.open('rkef-shell-v1.1.0-handover-auto');const entries=await cache.keys();
  assert(entries.length>20,'offline shell incomplete');assert(entries.every(r=>r.url.startsWith(location.origin+'/RKEF-Ticketing/')),'external responses cached');
  results.push('PASS existing session/local masters, save, correction, legacy Report TSV, manual draft persistence and 360px layout');
  results.push('PASS scoped PWA shell cached under /RKEF-Ticketing/; no Sheets responses cached');
  results.push('PASS simulated quota failure preserves draft and shows error; mocked cloud failure/pending/read-back preserves request ID');
  return results;
})()
