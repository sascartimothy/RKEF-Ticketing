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
  const line=['46315','TEST_DT','6','TEST_STOCK','TEST_PILE','','5','TEST_DOME','TEST DESTINATION','06.59','BDM'].join('\t');
  const data={...parseWA(line)[0].record,id:crypto.randomUUID(),shift:'Day',checker:'TEST CHECKER',origin:'local'};
  const session={operationDate:'2026-10-20',shift:'DS',scale:'BDM',checker:'TEST CHECKER',handoverConfirmed:true,handoverId:'synthetic-confirmed-session',nextNumber:1,nextRitase:'46315-001'};
  data.shift='DS';
  const prepare=async target=>{await target.saveSession(session);for(const m of deriveMappings([data],[]))await target.saveMaster(m);};
  const name='rkef-test-'+crypto.randomUUID();
  const db=await Database.open(indexedDB,name);
  await prepare(db);
  const first=await db.saveRecord(data,{draftId:'test-draft',sourceTime:'06.58'});
  assert(first.sourceSnapshot.time==='06.59','source snapshot');
  equal((await db.saveRecord(data,{draftId:'test-draft'})).id,first.id,'idempotent save retry');
  try{await db.saveRecord({...data,time:'06.00'},{draftId:'test-draft'});assert(false,'retry overwrote saved record');}catch(e){assert(e.message.includes('isi berbeda'),'changed retry error');}
  try{await db.saveRecord({...data,id:crypto.randomUUID()},{draftId:'duplicate'});assert(false,'unconfirmed duplicate stored');}catch(e){assert(e.message.includes('duplikat'),'transaction duplicate check');}
  const corrected=await db.saveRecord({...first,time:'07.01',note:'corrected'},{expectedRevision:1,draftId:'edit'});
  equal(corrected.sourceSnapshot.time,'06.59','immutable snapshot');equal(corrected.sourceTime,'06.58','source clock preserved');equal(corrected.editedTime,'07.01','edited time');
  try {await db.saveRecord({...first,time:'07.02'},{expectedRevision:1});assert(false,'stale revision allowed');}catch(e){assert(e.message.includes('berubah'),'stale correction error');}
  const audits=await db.all('audit');equal(audits.filter(a=>['create','correct'].includes(a.action)).length,2,'create/correct audit');
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
  try {await second.deleteRecord(first.id,2);assert(false,'numbered deletion allowed');}catch(e){assert(e.message.includes('OD-02'),'number deletion guard');}
  await second.restore(backup,'replace');equal((await second.all('audit')).length,backup.stores.audit.length,'atomic replacement');
  const changedLine=line.replace('TEST_PILE','NEW_TEST_PILE');
  const changedRows=parseWA(changedLine),changedMaps=deriveMappings(changedRows.map(r=>r.record),await second.all('masters')).map(m=>({...m,key:mappingKey(m)}));
  await second.saveMaster({kind:'stock',stockpile:'LOCAL_STOCK',pileId:'LOCAL_PILE',sourceCode:'1',key:mappingKey({kind:'stock',stockpile:'LOCAL_STOCK',pileId:'LOCAL_PILE',sourceCode:'1'})});
  await second.importHandover({digest:await sourceDigest(changedLine),rows:changedRows,mappings:changedMaps,metadata:{shift:'Day',checker:'TEST'},decisions:{}});
  const updatedMasters=await second.all('masters');
  assert(updatedMasters.some(m=>m.pileId==='TEST_PILE'&&m.active===false),'prior handover not superseded');
  assert(updatedMasters.some(m=>m.pileId==='LOCAL_PILE'&&m.active===true),'local additions lost on latest handover');
  db.db.close();second.db.close();indexedDB.deleteDatabase(name);indexedDB.deleteDatabase(name+'-restore');
  results.push('PASS real IndexedDB atomic abort, snapshots, correction conflict, audit, numbered-delete guard, import idempotency, backup/restore');

  // Verify the actual DOM transport, without transmitting any network request.
  const originalSubmit=HTMLFormElement.prototype.submit;let posted;
  HTMLFormElement.prototype.submit=function(){posted={method:this.method,action:this.action,target:this.target,enctype:this.enctype,fields:Object.fromEntries(new FormData(this))};};
  try{submitDestination(window.RKEF_CONFIG.appsScriptUrl,'TEST DESTINATION','pwa_browser_0123456');}finally{HTMLFormElement.prototype.submit=originalSubmit;}
  equal(posted.method,'post','iframe POST method');equal(Object.keys(posted.fields).sort(),['action','name','request_id'],'POST privacy fields');
  assert(document.querySelector(`iframe[name="${posted.target}"]`),'form targets iframe');
  let timeoutError=false;try{await jsonp(window.RKEF_CONFIG.appsScriptUrl,'list',20);}catch{timeoutError=true;}assert(timeoutError,'JSONP failure visible');
  results.push('PASS real DOM form-encoded iframe transport and failing JSONP (all external requests blocked)');

  const $=s=>document.querySelector(s);
  const set=(form,values)=>{for(const [k,v] of Object.entries(values))if(form.elements[k])form.elements[k].value=v;if('time' in values)form.elements.time.dispatchEvent(new Event('input',{bubbles:true}));};
  const input=el=>el.dispatchEvent(new Event('input',{bubbles:true}));
  const submit=selector=>$(selector).requestSubmit();
  let seedDb=await Database.open();
  await seedDb.saveMaster({kind:'stock',stockpile:'TEST_STOCK',pileId:'TEST_PILE',sourceCode:'6'});
  await seedDb.saveMaster({kind:'product',productCode:'5',dome:'TEST_DOME',destination:'TEST DESTINATION'});
  await seedDb.saveSession(session);
  const signal=new BroadcastChannel('rkef-ticketing');signal.postMessage('changed');
  await until(()=>state.session?.scale==='BDM','existing session load');
  equal([...document.querySelectorAll('#view-setup article h2')].map(e=>e.textContent),['Handover manual','Sesi operasional','Destination'],'Setup card order');
  equal(document.querySelectorAll('#view-setup article').length,4,'exactly four Setup cards');
  assert(!$('#master-form')&&!$('#session-form'),'removed editor references');
  assert(!$('#view-setup').textContent.includes('Sebelum mulai')&&!$('#view-setup').textContent.includes('Pilihan lokal'),'old cards remain');
  equal($('#app-version').textContent,'RKEF Ticketing — v1.1.2','version');
  const {renderReport}=await import('./js/report-ui.js');renderReport();
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden&&state.draft,'operation view');
  set($('#entry-form'),data); (await import('./js/operational-ui.js')).renderOperational();input($('#entry-form').elements.time);await flushDraft();
  submit('#entry-form');await until(()=>state.records.some(r=>r.dtNo==='TEST_DT'&&r.origin==='local'),'save UI');
  const saved=state.records.find(r=>r.dtNo==='TEST_DT');equal(saved.operationDate,'2026-10-20','operation date');equal(saved.time,'06.59','edited time saved');
  location.hash='report';await until(()=>!$('#view-report').hidden,'report view');
  equal($('#report-output').value,line.replace('46315','46315-001').split('\t').map((v,i)=>[2,6].includes(i)?'':v).join('\t'),'UI numbered TSV');equal($('#report-count').textContent,'1','UI summary count');
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'operation return');
  set($('#entry-form'),{dtNo:'820',time:'08.17'});input($('#entry-form').elements.dtNo);await flushDraft();
  const preservedDraft=structuredClone(state.draft);
  $(`[data-edit="${saved.id}"]`).click();await until(()=>$('#correction-dialog').open,'correction modal');
  equal(state.draft,preservedDraft,'opening correction lost draft');
  set($('#correction-form'),{time:'07.05',note:'TEST CORRECTION'});
  const modalSave=Database.prototype.saveRecord,modalRows=structuredClone(state.records);
  Database.prototype.saveRecord=async()=>{throw Error('TEST correction storage failure');};submit('#correction-form');
  await until(()=>!$('#correction-error').hidden,'modal failure');
  assert($('#correction-dialog').open,'failed correction closed modal');equal(state.draft,preservedDraft,'failed correction lost draft');equal(state.records,modalRows,'failed correction changed rows');
  Database.prototype.saveRecord=modalSave;submit('#correction-form');
  await until(()=>state.records.find(r=>r.id===saved.id)?.revision===2,'correction save');
  equal(state.records.find(r=>r.id===saved.id).sourceSnapshot.time,'06.59','UI source preserved');
  equal($('#report-output').value.split('\t')[9],'07.05','Report reflects persisted correction');
  equal(state.draft,preservedDraft,'correction changed draft');
  equal($('#entry-form').elements.dtNo.value,'820','entry form changed');
  assert(!$('#correction-dialog').open,'correction modal remains open');
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
  set($('#entry-form'),{...data,dtNo:'FAILED_TEST'}); (await import('./js/operational-ui.js')).renderOperational();input($('#entry-form').elements.dtNo);await flushDraft();submit('#entry-form');
  await until(()=>!$('#entry-error').hidden,'storage failure feedback');
  assert(!state.records.some(r=>r.dtNo==='FAILED_TEST'),'false storage success');
  assert(state.draft.values.dtNo==='FAILED_TEST','draft lost on failed save');
  let rejectPendingSave;
  Database.prototype.saveRecord=()=>new Promise((resolve,reject)=>{rejectPendingSave=reject;});
  submit('#entry-form'); await until(()=>!!rejectPendingSave,'pending save');
  $('#new-session').click(); await until(()=>!$('#new-session').disabled,'busy reset rejected');
  assert(!$('#confirm-dialog').open && $('#import-preview').textContent.includes('sedang berlangsung'),'reset allowed pending save');
  equal(state.session,originalSession,'busy reset changed session');
  rejectPendingSave(Error('TEST pending save rejected'));await until(()=>!$('#save-entry').disabled,'pending save settled');
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
  // Total reset uses one modal and drains autosave.
  $('#wa-source').value = ''; // Explicit reset-without-WA scenario; pending WA must never be reprocessed.
  const button = $('#new-session'), card = $('#handover-card');
  assert(card.contains(button) && button.compareDocumentPosition($('#wa-source')) & Node.DOCUMENT_POSITION_FOLLOWING, 'new session button position');
  assert($('#handover-session').compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING, 'active summary position');
  const resetBefore = await seedDb.snapshot(), memoryBefore = structuredClone(state.draft);
  let modalCount = 0;
  const modalShow = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function() { if(this.id === 'confirm-dialog') modalCount++; return modalShow.call(this); };
  button.click(); await until(()=>$('#confirm-dialog').open,'reset confirmation');
  equal($('#confirm-title').textContent,'Mulai Sesi Baru?','reset title');
  equal($('#confirm-ok').textContent,'Hapus Sesi & Mulai Baru','reset action');
  assert($('#confirm-dialog').getBoundingClientRect().right<=360 && document.documentElement.scrollWidth<=360,'reset modal overflow');
  equal(await seedDb.snapshot(),resetBefore,'data changed before confirmation');
  $('#confirm-dialog button[value="cancel"]').click();
  await until(()=>!button.disabled,'cancel reset settled');
  equal(await seedDb.snapshot(),resetBefore,'cancel reset changed data'); equal(state.draft,memoryBefore,'cancel reset changed memory');
  equal(modalCount,1,'more than one popup');
  const transactionReset = Database.prototype.transaction;
  Database.prototype.transaction = function(names,mode,work) {
    return transactionReset.call(this,names,mode,async stores=>{
      const result = await work(stores);
      if(mode==='readwrite' && names.length===7 && names.includes('records') && names.includes('audit') && names.includes('settings')) throw Error('TEST reset abort');
      return result;
    });
  };
  try {
    button.click(); await until(()=>$('#confirm-dialog').open,'failed reset confirmation'); $('#confirm-ok').click();
    await until(()=>!button.disabled,'failed reset settled');
    assert($('#import-preview').textContent.includes('TEST reset abort'),'failed reset reported success');
    equal(await seedDb.snapshot(),resetBefore,'reset abort lost data'); equal(state.draft,memoryBefore,'reset abort lost memory');
    equal(state.session,originalSession,'reset abort ended session');
  } finally { Database.prototype.transaction = transactionReset; }
  // Hold an autosave before it opens its transaction. Reset must wait for it.
  const saveDraftBefore = Database.prototype.saveDraft;
  let releaseDraft; const heldDraft = new Promise(resolve=>{releaseDraft=resolve;});
  Database.prototype.saveDraft = async function(value) { await heldDraft; return saveDraftBefore.call(this,value); };
  input($('#entry-form').elements.dtNo);
  button.click(); await wait(60); assert(!$('#confirm-dialog').open,'reset did not drain autosave');
  releaseDraft(); await until(()=>$('#confirm-dialog').open,'drained reset confirmation');
  Database.prototype.saveDraft = saveDraftBefore;
  button.click(); $('#confirm-ok').click();
  await until(()=>!button.disabled,'reset commit');
  HTMLDialogElement.prototype.showModal = modalShow;
  equal(modalCount,3,'reset showed repeated popup');
  equal(state.session,null,'old session still active'); equal(state.draft,null,'draft memory retained');
  equal(await seedDb.get('settings','session'),undefined,'session marker retained');
  equal(await seedDb.get('settings','draft'),undefined,'persisted draft retained');
  const resetAfter = await seedDb.snapshot();
  for(const store of ['records','masters','imports','pending','audit']) equal(resetAfter[store],[],store+' survived total reset');
  equal(resetAfter.cache, resetBefore.cache.filter(c=>['checkers','destinations'].includes(c.id)), 'shared caches changed');
  equal($('#wa-source').value,'','source not cleared'); assert($('#import-preview').textContent.startsWith('Seluruh data operasional lokal telah dihapus.'),'ready status');
  try { await seedDb.saveDraft(memoryBefore); assert(false,'stale tab recreated draft'); } catch(e) { assert(e.message.includes('direset'),'stale autosave error'); }
  equal(await seedDb.get('settings','draft'),undefined,'stale autosave restored draft');
  const resetBackup = await seedDb.backup(); (await import('./js/database.js')).validateBackup(resetBackup);
  const noopBefore = await seedDb.snapshot(); button.click(); await until(()=>$('#confirm-dialog').open,'empty reset confirmation');
  $('#confirm-ok').click(); await until(()=>!button.disabled,'empty reset');
  equal((await seedDb.snapshot()).records,[],'empty reset restored history');
  seedDb.db.close(); seedDb = await Database.open();
  results.push('PASS new session button/modal at 360px, cancel, atomic failure rollback, drained autosave, stale tab rejection, deleted active local records/audits, preserved only shared caches and fenced stale writes');
  // Typing and restoring source values must never import.
  const fullReport=Array.from({length:83},(_,i)=>numbered.replace('46315-001',`46315-${String(i+1).padStart(3,'0')}`).replace('06.59',['7.2','7.20','7.23','8.2','10.3','13.3','15','15.00','16.4'][i%9])).join('\n');
  $('#wa-source').value=fullReport; input($('#wa-source')); await wait(60);
  equal(state.session,null,'typing activated session');
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
  equal(state.session,null,'failed storage activated session');
  await paste(fullReport);
  await until(()=>state.session?.handoverConfirmed,'handover activation');
  assert(!$('#confirm-dialog').open&&!$('#confirm-import')&&!$('#ack-complete')&&!$('#ack-mapping'),'handover required confirmation');
  assert(!$('.import-rows')&&!$('#detected-session')&&$('#import-preview').textContent.length<300,'long handover preview');
  equal($('#import-preview').textContent,'Handover berhasil. Sesi operasional telah diaktifkan.','handover success status');
  equal(state.session.scale,'ONI','detected scale');equal(state.session.nextRitase,'46315-084','preparation number');
  assert(!state.session.ritaseNumber,'session allocated permanent number');
  assert(!state.masters.some(m=>m.stockpile==='TEST_STOCK'&&m.origin==='local'),'old local master survived reset');
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
  await (async () => {
    const {state} = await import('./js/state.js'); const {Database} = await import('./js/database.js');
    const db = await Database.open();
    const cache = {id:'checkers',syncedAt:new Date().toISOString(),values:[{checker_id:'CHK-test-picker',name:'TEST CURRENT CHECKER',is_active:true,version:1,request_id:''}]};
    await db.put('cache',cache); db.db.close(); state.checkerCache = cache;
    document.querySelector('#choose-checkers').click();
    for (const input of document.querySelectorAll('#checker-body input[type=checkbox]')) input.checked = input.dataset.index === '0';
    document.querySelector('#checker-ok').click();
  })();
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
  await isolated.importHandover({source:bdmSource,decisions:{complete:true}});
  const beforeReplay=(await isolated.get('settings','session')).value;
  equal(beforeReplay.scale,'BDM','safe reuse did not activate target scale');
  const beforeStaleReset = await isolated.snapshot();

  // Reset compares both session and draft atomically; stale tabs cannot delete replacements.
  try { await isolated.endSession(null,null); assert(false,'stale session reset accepted'); }
  catch(e) { assert(e.message.includes('berubah'),'stale reset error'); }
  equal(await isolated.snapshot(),beforeStaleReset,'stale reset changed data');
  const resetPeer = await Database.open(indexedDB,isolated.db.name);
  const pendingDraft = {id:'peer-draft',session:beforeReplay,dirty:true};
  await resetPeer.saveDraft(pendingDraft);
  const withPeerDraft = await isolated.snapshot();
  try { await isolated.endSession(beforeReplay,null); assert(false,'changed peer draft discarded'); }
  catch(e) { assert(e.message.includes('berubah'),'peer draft reset error'); }
  equal(await isolated.snapshot(),withPeerDraft,'peer conflict changed data');
  await isolated.endSession(beforeReplay,pendingDraft);
  const endedSnapshot = await isolated.snapshot();
  assert(!(await isolated.importHandover({source:bdmSource})).already,'reset retained import identity');
  const replayedSnapshot = await isolated.snapshot();
  equal(endedSnapshot.records,[],'total reset retained history');
  equal(replayedSnapshot.records.length,83,'fresh import history missing');
  equal(replayedSnapshot.settings.find(s=>s.id==='session').value.nextRitase,'46315-084','reuse preparation');
  const reopen = await Database.open(indexedDB,isolated.db.name);
  equal((await reopen.get('settings','session')).value.nextRitase,'46315-084','reopen lost reused session');
  try { await resetPeer.saveDraft(pendingDraft); assert(false,'peer recreated stale draft'); }
  catch(e) { assert(e.message.includes('direset'),'peer autosave error'); }
  await isolated.put('settings',{id:'draft',value:{dirty:true,session:(await isolated.get('settings','session')).value}});
  const dirtyReplay = await isolated.snapshot();
  try { await isolated.importHandover({source:bdmSource}); assert(false,'receipt bypassed dirty draft'); }
  catch(e) { assert(e.message.includes('Draft aktif'),'reuse draft guard'); }
  equal(await isolated.snapshot(),dirtyReplay,'reuse changed dirty draft');
  await isolated.transaction(['settings'],'readwrite',s=>s.settings.delete('draft'));
  const localCollision={...parseWA(handoverLine(84))[0].record,id:crypto.randomUUID(),origin:'local',shift:'NS',checker:'TEST'};
  await isolated.put('records',localCollision);
  const collisionReplay=await isolated.snapshot();
  try { await isolated.importHandover({source:bdmSource}); assert(false,'receipt bypassed local collision'); }
  catch(e) { assert(e.message.includes('bertabrakan'),'reuse collision reason'); }
  equal(await isolated.snapshot(),collisionReplay,'reuse overwrote local transaction/history');
  await isolated.transaction(['records'],'readwrite',s=>s.records.delete(localCollision.id));
  const futureImport={...localCollision,origin:'import'};
  await isolated.put('records',futureImport);
  const importedCollision=await isolated.snapshot();
  try { await isolated.importHandover({source:bdmSource}); assert(false,'reuse ignored imported target collision'); }
  catch(e) { assert(e.message.includes('bertumpang tindih'),'imported target guard'); }
  equal(await isolated.snapshot(),importedCollision,'reuse overwrote imported target');
  await isolated.transaction(['records'],'readwrite',s=>s.records.delete(futureImport.id));
  const damaged=(await isolated.all('records')).find(r=>r.importId===beforeReplay.handoverId);
  await isolated.put('records',{...damaged,note:'CHANGED HISTORY'});
  const damagedSnapshot=await isolated.snapshot();
  try { await isolated.importHandover({source:bdmSource}); assert(false,'receipt hid damaged history'); }
  catch(e) { assert(e.message.includes('tidak sesuai receipt'),'receipt consistency guard'); }
  equal(await isolated.snapshot(),damagedSnapshot,'damaged history was overwritten');
  reopen.db.close();resetPeer.db.close();
  results.push('PASS two-connection session/draft reset conflict guards and identical reimport after reset activates without duplicate history');

  // Real IndexedDB tests for Option B, serialized connections, rollback and NS ambiguity.
  const numbering=await Database.open(indexedDB,'rkef-numbering-'+crypto.randomUUID());
  const numberingPeer=await Database.open(indexedDB,numbering.db.name);
  const numberingSession={...session,scale:'BDM',startNumber:84,nextNumber:84,nextRitase:'46315-084',handoverId:'numbering-fixture'};
  await prepare(numbering);await numbering.saveSession(numberingSession);
  const numberedData=(dt,time)=>({...data,id:crypto.randomUUID(),dtNo:dt,time,shift:'DS',scale:'BDM'});
  const a=await numbering.saveRecord(numberedData('SAP_820','15.20'),{draftId:'a'});
  const b=await numbering.saveRecord(numberedData('SAP_817','15.25'),{draftId:'b'});
  const c=await numbering.saveRecord(numberedData('SAP_1039','15.30'),{draftId:'c'});
  await numbering.put('records',{...a,id:'frozen-import',origin:'import',ritaseNumber:83});
  await numbering.put('records',{...a,id:'other-scale',scale:'ONI',ritaseNumber:84});
  await numbering.put('records',{...a,id:'other-date',operationDate:'2026-10-19',ritaseNumber:84});
  const draftGuard={id:'separate-entry-draft',value:{id:'new-input',dirty:true}};
  await numbering.put('settings',{...draftGuard,id:'draft'});
  const correctedC=await numbering.saveRecord({...c,time:'15.22'},{expectedRevision:1});
  equal(correctedC.id,c.id,'UUID changed');equal(correctedC.ritaseNumber,85,'corrected position');
  equal((await numbering.get('records',b.id)).ritaseNumber,86,'peer number');
  equal((await numbering.get('records',a.id)).ritaseNumber,84,'first number');
  equal((await numbering.get('records','other-scale')).ritaseNumber,84,'other scale changed');
  equal((await numbering.get('records','other-date')).ritaseNumber,84,'other date changed');
  equal((await numbering.get('records','frozen-import')).ritaseNumber,83,'import changed');
  equal(await numbering.get('settings','draft'),{...draftGuard,id:'draft'},'correction deleted draft');
  assert((await numbering.all('audit')).some(a=>a.action==='renumber'&&a.recordId===b.id&&a.before.ritaseNumber===85&&a.after.ritaseNumber===86),'peer renumber audit missing');
  assert((await numbering.all('audit')).some(a=>a.action==='correct'&&a.recordId===c.id&&a.before.ritaseNumber===86&&a.after.ritaseNumber===85),'candidate renumber audit missing');
  // Abort after number, peer writes, counter and audit have been queued.
  const rollbackSnapshot=await numbering.snapshot(), transactionBefore=numbering.transaction;
  numbering.transaction=function(names,mode,work){return transactionBefore.call(this,names,mode,async stores=>{await work(stores);throw Error('TEST atomic numbering abort');});};
  try{await numbering.saveRecord({...correctedC,time:'15.19'},{expectedRevision:2});assert(false,'failure accepted');}catch(e){assert(e.message.includes('abort'),'expected injected failure');}
  numbering.transaction=transactionBefore;
  equal(await numbering.snapshot(),rollbackSnapshot,'numbering partially persisted');
  const concurrentData=[numberedData('SAP_900','15.21'),numberedData('SAP_901','15.21')];
  const concurrent=await Promise.all([numbering.saveRecord(concurrentData[0],{draftId:'concurrent-a'}),numberingPeer.saveRecord(concurrentData[1],{draftId:'concurrent-b'})]);
  const ordered=(await numbering.all('records')).filter(r=>r.numberingSession===numberingSession.handoverId&&r.origin==='local'&&r.operationDate==='2026-10-20'&&r.scale==='BDM').sort((a,b)=>a.ritaseNumber-b.ritaseNumber);
  equal(ordered.map(r=>r.ritaseNumber),[84,85,86,87,88],'concurrent sequential numbers');
  const retried=await numbering.saveRecord(concurrentData[0],{draftId:'concurrent-a'});equal(retried.id,concurrent[0].id,'retry identity');
  const countAfterRetry=(await numbering.get('settings','session')).value.nextNumber;equal(countAfterRetry,89,'retry consumed number');
  const restoreNumbering=await Database.open(indexedDB,'rkef-numbering-restore-'+crypto.randomUUID());
  await numbering.transaction(['settings'],'readwrite',s=>s.settings.delete('draft'));
  const fullNumberingBackup=await numbering.backup();await restoreNumbering.restore(fullNumberingBackup);
  equal(await restoreNumbering.snapshot(),fullNumberingBackup.stores,'backup lost numbering/audit');
  // A second connection observes persisted IDs/numbers (the runner also reloads the browser later).
  equal((await numberingPeer.get('records',c.id)).ritaseNumber,87,'persisted correction after concurrent inserts');
  await numbering.saveSession({...numberingSession,shift:'NS',handoverId:'NS-fixture',nextNumber:89,nextRitase:'46315-089',startNumber:89});
  const nsData={...numberedData('SAP_950','23.50.10'),shift:'NS'};
  const nsFirst=await numbering.saveRecord(nsData,{draftId:'ns-a',sourceTime:'23.50.10',clockDate:'2026-10-20'});
  const nsSecond=await numbering.saveRecord({...nsData,id:crypto.randomUUID(),dtNo:'SAP_951',time:'00.15.30'},{draftId:'ns-b',sourceTime:'00.15.30',clockDate:'2026-10-21'});
  equal(nsFirst.ritaseNumber,89,'NS first');equal(nsSecond.ritaseNumber,90,'midnight order');
  const nsSnapshot=await numbering.snapshot();
  for(const action of [()=>numbering.saveRecord({...nsSecond,time:'23.40.20'},{expectedRevision:1}),()=>numbering.saveRecord({...nsData,id:crypto.randomUUID(),time:'00.10.20'},{sourceTime:'23.50.10',clockDate:'2026-10-20'})]) {
    try{await action();assert(false,'ambiguous NS accepted');}catch(e){assert(e.message.includes('BLOCKED'),'NS blocked reason');}
    equal(await numbering.snapshot(),nsSnapshot,'blocked NS changed data');
  }
  const closedRecord=await numbering.get('records',a.id);
  try{await numbering.saveRecord({...closedRecord,note:'closed-session'},{expectedRevision:closedRecord.revision});assert(false,'old session corrected');}catch(e){assert(e.message.includes('sesi aktif'),'closed session error');}
  numbering.db.close();numberingPeer.db.close();restoreNumbering.db.close();
  results.push('PASS Option B stored numbering, UUID, peer audits, atomic abort, concurrent connections/retry, import/date/scale isolation, closed sessions and exact backup/restore');
  results.push('PASS NS verified device-date chronology across midnight; ambiguous manual NS date/time BLOCKED without writes');
  isolated.db.close();

  location.hash='setup';await until(()=>!$('#view-setup').hidden,'DS checker');
  await (async () => {
    const {state} = await import('./js/state.js'); const {Database} = await import('./js/database.js');
    const db = await Database.open();
    const cache = {id:'checkers',syncedAt:new Date().toISOString(),values:[{checker_id:'CHK-test-picker',name:'TEST DS CHECKER',is_active:true,version:1,request_id:''}]};
    await db.put('cache',cache); db.db.close(); state.checkerCache = cache;
    document.querySelector('#choose-checkers').click();
    for (const input of document.querySelectorAll('#checker-body input[type=checkbox]')) input.checked = input.dataset.index === '0';
    document.querySelector('#checker-ok').click();
  })();await until(()=>state.session?.checker==='TEST DS CHECKER','DS checker saved');
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'new DS input');
  const choose=(kind)=>{if(kind==='stock'){$('#choose-stock').click();$('#stock-body [data-stock-select]').click();return;}$('#choose-product').click();$('#product-body [data-product-select]').click();};
  const dtCases=['820','SAP_821','OTHER_822','823','824','825','826'];
  for(let i=0;i<dtCases.length;i++){
    set($('#entry-form'),{dtNo:dtCases[i],time:`08.${String(i).padStart(2,'0')}`});choose('stock');choose('product');input($('#entry-form').elements.dtNo);await flushDraft();
    equal($('#entry-form').elements.sourceCode.value,'','new stock source unused');equal($('#entry-form').elements.productCode.value,'','legacy product unused');
    const countBeforeSave=state.records.length;
    $('#save-entry').click();$('#save-entry').click();
    assert($('#save-entry').disabled && $('#save-entry').getAttribute('aria-busy')==='true','fixed save loading');
    await until(()=>state.records.some(r=>r.dtNo===(/^\d+$/.test(dtCases[i])?'SAP_'+dtCases[i]:dtCases[i])&&r.operationDate==='2026-10-21'),'simplified save');
    await until(()=>!$('#save-entry').disabled,'save completed');
    equal(state.records.length,countBeforeSave+1,'double click created extra record');
    const savedMapping=state.records.find(r=>r.dtNo===(/^\d+$/.test(dtCases[i])?'SAP_'+dtCases[i]:dtCases[i])&&r.operationDate==='2026-10-21');
    equal(savedMapping.productCode,'','legacy product blank in new record');
    equal($('#entry-form').elements.dtNo.value,'','next form not prepared');assert(!state.draft.dirty,'new form dirty');
  }
  equal($('#history').children.length,5,'default history exceeds five');
  assert($('#more-history').textContent.includes('7'),'expand count');$('#more-history').click();equal($('#history').children.length,7,'expand did not show all');
  assert(!$('#correction-dialog').open,'history expanded in popup');$('#more-history').click();equal($('#history').children.length,5,'collapse history');
  $('#history-search').value='820';$('#history-search').dispatchEvent(new Event('input',{bubbles:true}));equal($('#history').children.length,1,'numeric DT search');
  $('#history-search').value='';$('#history-search').dispatchEvent(new Event('input',{bubbles:true}));
  const correctionTarget=state.records.find(r=>r.dtNo==='SAP_826'&&r.operationDate==='2026-10-21');
  $(`[data-edit="${correctionTarget.id}"]`).click();await until(()=>$('#correction-dialog').open,'numbered modal');
  set($('#correction-form'),{time:'08.01',note:'modal reorder'});submit('#correction-form');
  await until(()=>!$('#correction-dialog').open,'numbered correction saved');
  const finalTarget=state.records.find(r=>r.id===correctionTarget.id);equal(finalTarget.ritaseNumber,3,'modal time reorder numbering');
  assert(document.documentElement.scrollWidth<=360,'Operational overflow');
  const realRows=state.records;
  const largeRow=realRows.find(r=>r.id===correctionTarget.id);
  state.records=Array.from({length:300},(_,i)=>({...largeRow,id:'large-'+i,dtNo:'SAP_'+i,ritaseNumber:i+1}));
  const {renderHistory}=await import('./js/operational-ui.js');renderHistory();
  equal($('#history').children.length,5,'large default history');const renderStart=performance.now();$('#more-history').click();equal($('#history').children.length,300,'large expansion');
  results.push(`PASS 300-row inline history rendered in ${Math.round(performance.now()-renderStart)}ms (local desktop measurement)`);
  $('#more-history').click();equal($('#history').children.length,5,'large collapse');state.records=realRows;renderHistory();
  results.push('PASS 360px simplified selectors, numeric SAP/full/other prefix, automatic next form, five-row history expand/collapse/search and modal time renumbering');
  results.push('PASS Setup four cards, v1.1.2, complete numbered handover, automatic paste, concise status, manual checker, storage rollback, scale isolation, mixed rejection, idempotence, draft protection and backup compatibility');
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'return for final draft');
  set($('#entry-form'),{dtNo:'UNSAVED_TEST',time:'07.17'});input($('#entry-form').elements.time);await flushDraft();
  assert(document.documentElement.scrollWidth<=360,'360px layout overflows horizontally');
  await navigator.serviceWorker.ready;
  const registration = await navigator.serviceWorker.getRegistration();
  equal(registration.scope, location.origin + '/RKEF-Ticketing/', 'unchanged Pages worker scope');
  await until(()=>!!navigator.serviceWorker.controller,'service worker control');
  const cache=await caches.open('rkef-shell-v1.1.2-dt-keypad-fit');const entries=await cache.keys();
  assert(entries.length>20,'offline shell incomplete');assert(entries.every(r=>r.url.startsWith(location.origin+'/RKEF-Ticketing/')),'external responses cached');
  results.push('PASS existing session/local masters, save, correction, stored-number Report TSV, manual draft persistence and 360px layout');
  results.push('PASS scoped PWA shell cached under /RKEF-Ticketing/; no Sheets responses cached');
  results.push('PASS simulated quota failure preserves draft and shows error; mocked cloud failure/pending/read-back preserves request ID');
  return results;
})()
