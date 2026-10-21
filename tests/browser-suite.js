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
  async function addMaster(kind,values){$('#master-kind').value=kind;$('#master-kind').dispatchEvent(new Event('change'));set($('#master-form'),values);submit('#master-form');await until(()=>state.masters.some(m=>m.kind===kind&&Object.entries(values).every(([k,v])=>m[k]===v)),'master save');}
  await addMaster('stock',{stockpile:'TEST_STOCK',pileId:'TEST_PILE',sourceCode:'6'});
  await addMaster('product',{productCode:'5',dome:'TEST_DOME',destination:'TEST DESTINATION'});
  set($('#session-form'),{operationDate:'2026-10-20',shift:'Day',scale:'TEST_SCALE',checker:'TEST CHECKER'});submit('#session-form');
  await until(()=>state.session?.scale==='TEST_SCALE','session');
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
  // Legacy and malformed rows stay visible and never import without explicit review.
  const legacy=['46315-001','LEGACY_TEST','6','TEST_STOCK','TEST_PILE','5','TEST_DOME','TEST DESTINATION','06.58','TEST_SCALE'].join('\t');
  $('#wa-source').value=legacy+'\n'+line.replace('06.59','52.00,0');input($('#wa-source'));$('#preview-import').click();
  await until(()=>!!$('#confirm-import'),'legacy preview');
  assert(document.querySelector('[data-import-line="2"]').disabled,'invalid source disabled');
  assert($('#import-preview').textContent.includes('52.00,0'),'bad raw source visible');
  $('#import-shift').value='Night';$('#import-checker').value='TEST PREVIOUS';$('#confirm-import').click();
  await until(()=>!$('#confirm-import').disabled,'legacy rejection');assert(!$('#confirm-dialog').open,'legacy import proceeded without acknowledgment');
  assert(!state.records.some(r=>r.dtNo==='LEGACY_TEST'),'legacy stored without review');
  // An import duplicate must be confirmed and must remain outside the active report.
  $('#wa-source').value=line;input($('#wa-source'));$('#preview-import').click();await until(()=>!!$('#confirm-import'),'import preview');
  $('#import-shift').value='Night';$('#import-checker').value='TEST PREVIOUS';$('#ack-duplicates').checked=true;
  $('#confirm-import').click();await until(()=>$('#confirm-dialog').open,'import confirm');$('#confirm-ok').click();
  await until(()=>state.records.some(r=>r.origin==='import'),'import stored');
  location.hash='report';await until(()=>!$('#view-report').hidden,'report');equal($('#report-count').textContent,'1','history excluded by default');
  $('#filter-form').elements.origin.value='import';$('#filter-form').elements.shift.value='';$('#filter-form').elements.checker.value='';$('#filter-form').dispatchEvent(new Event('change'));
  equal($('#report-count').textContent,'1','import filter');equal($('#report-output').value,line,'import preserves source');
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
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'return for final draft');
  set($('#entry-form'),{dtNo:'UNSAVED_TEST',time:'07.17'});input($('#entry-form').elements.time);await flushDraft();
  assert(document.documentElement.scrollWidth<=360,'360px layout overflows horizontally');
  await navigator.serviceWorker.ready;
  const registration = await navigator.serviceWorker.getRegistration();
  equal(registration.scope, location.origin + '/RKEF-Ticketing/', 'unchanged Pages worker scope');
  await until(()=>!!navigator.serviceWorker.controller,'service worker control');
  const cache=await caches.open('rkef-shell-v1');const entries=await cache.keys();
  assert(entries.length>20,'offline shell incomplete');assert(entries.every(r=>r.url.startsWith(location.origin+'/RKEF-Ticketing/')),'external responses cached');
  results.push('PASS UI session, local master, save, correction, exact TSV, handover preview/import, source filters, manual draft persistence and 360px layout');
  results.push('PASS scoped PWA shell cached under /RKEF-Ticketing/; no Sheets responses cached');
  results.push('PASS simulated quota failure preserves draft and shows error; mocked cloud failure/pending/read-back preserves request ID');
  return results;
})()
