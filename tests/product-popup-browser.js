(async () => {
  const {state} = await import('./js/state.js');
  const {Database} = await import('./js/database.js');
  const {renderOperational,flushDraft,fillDraft} = await import('./js/operational-ui.js');
  const {productPairs} = await import('./js/master-data.js');
  const $ = s => document.querySelector(s);
  const assert = (v,m) => {if(!v)throw Error(m);};
  const until = async (f,m) => {for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}throw Error(m);};
  const db = await Database.open();
  if (sessionStorage.getItem('product-baseline')) {
    assert(state.masters.some(m => m.id === sessionStorage.getItem('product-id') && m.dome === 'SCZ-1192'), 'Mapping edit lost after offline reload');
    assert($('#product-summary').textContent === 'SCZ-1192 / PRODUCT DEST B','Draft selection lost after offline reload');
    assert(JSON.stringify(await db.all('records')) === sessionStorage.getItem('product-records'),'History changed after reload');
    await db.restore(JSON.parse(sessionStorage.getItem('product-baseline')),'replace');db.db.close();
    for (const k of ['product-baseline','product-id','product-records']) sessionStorage.removeItem(k);
    return 'PASS Product Code mapping, stock relation and manual draft persist through real offline reload; history frozen';
  }
  // Real old -> new handover in its own database: no old numeric master is needed.
  const isolated=await Database.open(indexedDB,'rkef-product-contract-'+crypto.randomUUID());
  const row=(n,source,legacy) => ['46315-'+String(n).padStart(3,'0'),'SAP_820',source,'SS_14','S14_33','',legacy,'SCZ-1190','PRODUCT DEST A','7.2','BDM'].join('\t');
  await isolated.importHandover({source:row(1,'6','5')});
  const frozen=JSON.stringify(await isolated.all('records'));
  await isolated.importHandover({source:row(2,'','')});
  assert(JSON.stringify((await isolated.all('records')).filter(r=>r.ritaseNumber===1))===frozen,'New handover changed old source/snapshot');
  let session=(await isolated.get('settings','session')).value;
  assert(session.shift==='DS'&&session.operationDate==='2026-10-21','New blank-7 handover failed');
  await isolated.saveChecker('PRODUCT TEST',session);session=(await isolated.get('settings','session')).value;
  const saved=await isolated.saveRecord({...session,id:crypto.randomUUID(),dtNo:'SAP_821',stockpile:'SS_14',pileId:'S14_33',dome:'SCZ-1190',destination:'PRODUCT DEST A',time:'08.20',note:''});
  assert(saved.productCode===''&&saved.sourceCode==='','Legacy metadata required for new save');
  const {exportLine}=await import('./js/wa-exporter.js');
  const cols=exportLine(saved).split('\t');
  assert(cols.length===11&&[2,5,6].every(i=>cols[i]==='')&&cols[7]==='SCZ-1190'&&cols[8]==='PRODUCT DEST A','Saved new TSV contract wrong');
  isolated.db.close();
  await flushDraft();sessionStorage.setItem('product-baseline',JSON.stringify(await db.backup()));
  const oldRecords = JSON.stringify(await db.all('records'));
  const cache = {id:'destinations',syncedAt:new Date().toISOString(),values:['PRODUCT DEST A','PRODUCT DEST B'].map((destination_name,i)=>({destination_id:'DST-product-'+i,destination_name,is_active:true,request_id:''}))};
  await db.put('cache',cache);state.cache=cache;
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'Operational view');
  const open = () => $('#choose-product').click();
  const set = (dome,destination) => {$('#product-form').elements.dome.value=dome;$('#product-form').elements.destination.value=destination;};
  const save = async () => {$('#product-ok').click();await until(()=>!$('#product-form') || !$('#product-error').hidden,'Product save');};
  assert(!$('#entry-form select[data-mapping=product]'),'Native entry dropdown remains');
  assert($('#choose-product').closest('label').textContent.startsWith('Product Code / Destination'),'Product label');
  const draftBefore=JSON.stringify(state.draft), beforeCancel=JSON.stringify(await db.snapshot());
  open();assert($('#product-dialog').open&&!$('#save-entry').checkVisibility(),'Popup/save visibility');
  $('#product-add').click();set('CANCELLED','PRODUCT DEST A');$('#product-cancel').click();
  assert(JSON.stringify(await db.snapshot())===beforeCancel&&JSON.stringify(state.draft)===draftBefore,'Cancel changed data/draft');
  open();$('#product-add').click();set('','PRODUCT DEST A');await save();assert(!$('#product-error').hidden,'Empty product accepted');
  set('SCZ-1190','PRODUCT DEST A');await save();
  let added=state.masters.find(m=>m.dome==='SCZ-1190'&&m.destination==='PRODUCT DEST A');
  assert(added && added.productCode==='','Mapping requires legacy numeric code: '+JSON.stringify({added,error:$('#product-error').textContent,form:!!$('#product-form')}));
  assert(JSON.stringify(state.draft)===draftBefore,'Adding mapping changed draft before selection');
  $('#product-add').click();set('scz-1190','PRODUCT DEST A');await save();assert($('#product-error').textContent.includes('sudah tersedia'),'Duplicate pair accepted');
  $('#product-cancel').click();
  open();$(`[data-product-select="${added.id}"]`).click();await flushDraft();
  assert(!$('#product-dialog').open&&$('#product-summary').textContent==='SCZ-1190 / PRODUCT DEST A','One-tap selection failed');
  const stock=await db.saveStockPair({stockpile:'SS_14',pileId:'S14_33',dome:added.dome,destination:added.destination});
  state.masters=await db.all('masters');renderOperational();
  $('#choose-stock').click();$(`[data-stock-select="${stock.id}"]`).click();await flushDraft();
  assert($('#product-summary').textContent==='SCZ-1190 / PRODUCT DEST A','Stock autofill failed');
  open();$(`[data-product-edit="${added.id}"]`).click();set('SCZ-1191','PRODUCT DEST B');await save();
  assert(state.masters.find(m=>m.id===stock.id).dome==='SCZ-1191','Stock relation not updated');
  assert($('#product-summary').textContent==='SCZ-1191 / PRODUCT DEST B','Edited selected mapping not refreshed');
  added=state.masters.find(m=>m.id===added.id);
  const stale=structuredClone(added);
  $('#product-close').click();
  const alternative=await db.saveProductPair({dome:'OVERRIDE',destination:'PRODUCT DEST A'});
  state.masters=await db.all('masters');renderOperational();
  open();$(`[data-product-select="${alternative.id}"]`).click();await flushDraft();renderOperational();
  assert($('#product-summary').textContent==='OVERRIDE / PRODUCT DEST A','Override lost on rerender');
  assert(state.masters.find(m=>m.id===stock.id).dome==='SCZ-1191','Override rewrote stock master');
  // Editing a different master must preserve the current manual override.
  open();$(`[data-product-edit="${added.id}"]`).click();set('SCZ-1192','PRODUCT DEST B');await save();$('#product-close').click();
  assert($('#product-summary').textContent==='OVERRIDE / PRODUCT DEST A','Unrelated edit clobbered override');
  for (const dome of ['BAD\tCODE','<BAD>',' PADDED ']) {
    try { await db.saveProductPair({dome,destination:'PRODUCT DEST A'});throw Error('Unsafe text accepted'); } catch(e) {assert(!e.message.includes('Unsafe text accepted'),e.message);}
  }
  let snapshot=JSON.stringify(await db.snapshot());
  try {await db.saveProductPair({dome:'STALE',destination:'PRODUCT DEST A'},stale);throw Error('Stale accepted');}catch(e){assert(e.message.includes('berubah'),'Stale guard missing');}
  assert(JSON.stringify(await db.snapshot())===snapshot,'Stale write mutated stores');
  try { await db.saveProductPair({dome:'WRONG KIND',destination:'PRODUCT DEST A'},state.masters.find(m=>m.id===stock.id));throw Error('Stock ID accepted as product'); } catch(e) {assert(e.message.includes('berubah'),'Wrong-kind identity guard missing');}
  const transaction=db.transaction;
  db.transaction=function(names,mode,work){return transaction.call(this,names,mode,async s=>{await work(s);throw Error('TEST product abort');});};
  try{await db.saveProductPair({dome:'ROLLBACK',destination:'PRODUCT DEST A'},state.masters.find(m=>m.id===added.id));throw Error('Abort accepted');}catch(e){assert(e.message.includes('TEST product abort'),e.message);}finally{db.transaction=transaction;}
  assert(JSON.stringify(await db.snapshot())===snapshot,'Atomic edit rollback failed');
  assert(JSON.stringify(await db.all('records'))===oldRecords,'Mapping CRUD rewrote history');
  assert(JSON.stringify(await db.get('cache','destinations'))===JSON.stringify(cache),'Local mapping mutated shared cache');
  assert(productPairs([{...alternative,id:'legacy1',productCode:'1'},{...alternative,id:'legacy2',productCode:'2'}]).length===1,'Legacy col7 duplicates not collapsed');
  open();$(`[data-product-select="${added.id}"]`).click();await flushDraft();
  sessionStorage.setItem('product-id',added.id);sessionStorage.setItem('product-records',oldRecords);db.db.close();document.activeElement?.blur();
  return 'PASS Product popup select/Add/Edit/Cancel, empty/duplicate validation, stable ID, stock relation update, autofill/manual override, stale rejection, atomic rollback, frozen history and shared cache';
})()
