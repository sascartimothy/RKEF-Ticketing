(async () => {
  const {state} = await import('./js/state.js');
  const {Database} = await import('./js/database.js');
  const {renderOperational,flushDraft,fillDraft} = await import('./js/operational-ui.js');
  const {stockPairs,resolveProduct} = await import('./js/master-data.js');
  const {exportLine,sessionReport} = await import('./js/wa-exporter.js');
  const $ = s => document.querySelector(s);
  const assert = (v,m) => {if(!v)throw Error(m);};
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  const until = async (f,m) => {for(let i=0;i<200;i++){if(f())return;await wait(20);}throw Error(m);};
  const db=await Database.open();
  if(sessionStorage.getItem('stock-test-reload')) {
    assert(state.masters.some(m=>m.stockpile==='LS_46'&&m.pileId==='L46_PL02'&&m.dome==='POP_DOME_2'&&m.active!==false),'Mapping lost after offline reload');
    assert(!stockPairs(state.masters).some(m=>m.pileId==='S99_03'),'Deleted pair returned after reload');
    assert(JSON.stringify(state.records)===sessionStorage.getItem('stock-test-records'),'Historical snapshots changed after reload');
    const baseline=JSON.parse(sessionStorage.getItem('stock-test-baseline'));
    await db.restore(baseline,'replace');db.db.close();
    for(const k of ['stock-test-reload','stock-test-baseline','stock-test-records'])sessionStorage.removeItem(k);
    return 'PASS stock mapping persists through real offline reload; inactive pair stays hidden; all prior records unchanged';
  }
  await flushDraft();
  sessionStorage.setItem('stock-test-baseline',JSON.stringify(await db.backup()));
  const oldRecords=JSON.stringify(await db.all('records'));
  const cache={id:'destinations',syncedAt:new Date().toISOString(),values:[{destination_id:'DST-pop-1',destination_name:'POP DEST 1',is_active:true,request_id:''},{destination_id:'DST-pop-2',destination_name:'POP DEST 2',is_active:true,request_id:''}]};
  await db.put('cache',cache);state.cache=cache;
  for(const p of [{kind:'product',productCode:'51',dome:'POP_DOME_1',destination:'POP DEST 1'},{kind:'product',productCode:'52',dome:'POP_DOME_2',destination:'POP DEST 2'}])await db.saveMaster(p);
  state.masters=await db.all('masters');renderOperational();
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden,'Operational view');
  const open=()=>$('#choose-stock').click();
  const manage=()=>{open();$('#stock-manage').click();};
  const set=(fields)=>{const f=$('#stock-form');for(const [k,v]of Object.entries(fields)){f.elements[k].value=v;f.elements[k].dispatchEvent(new Event('input',{bubbles:true}));}};
  const save=async()=>{$('#stock-ok').click();await until(()=>!$('#stock-form')||!$('#stock-error').hidden,'Save not completed');};
  const find=(selector,pile)=>[...document.querySelectorAll(selector)].find(b=>state.masters.find(m=>m.id===Object.values(b.dataset)[0])?.pileId===pile);
  // A real legacy handover populates selectable masters without the new popup grammar.
  const legacyDb=await Database.open(indexedDB,'rkef-legacy-names-'+crypto.randomUUID());
  const source=['TS_14','TS_15','C_02'].map((s,i)=>['46315-'+String(i+1).padStart(3,'0'),'SAP_'+(900+i),'6',s,'OLD_'+i,'','51','POP_DOME_1','POP DEST 1','7.2','BDM'].join('\t')).join('\n');
  await legacyDb.importHandover({source});
  assert(stockPairs(await legacyDb.all('masters')).length===3,'Legacy handover masters rejected');
  const legacyRecords=JSON.stringify(await legacyDb.all('records'));
  await legacyDb.put('cache',cache);
  for(const m of stockPairs(await legacyDb.all('masters'))) {
    await legacyDb.saveStockPair({...m,dome:'POP_DOME_2',destination:'POP DEST 2'},m);
  }
  assert(JSON.stringify(await legacyDb.all('records'))===legacyRecords,'Legacy edit mutated history');legacyDb.db.close();
  const legacy=await db.saveMaster({kind:'stock',stockpile:'TS_14',pileId:'OLD_PILE',dome:'POP_DOME_1',destination:'POP DEST 1'});
  state.masters=await db.all('masters');
  manage();find('[data-stock-edit]','OLD_PILE').click();set({dome:'POP_DOME_2',destination:'POP DEST 2'});await save();
  assert(state.masters.find(m=>m.id===legacy.id).dome==='POP_DOME_2','Legacy target edit blocked');
  find('[data-stock-edit]','OLD_PILE').click();set({stockpile:'TS_16'});
  const invalidEditSnapshot=JSON.stringify(await db.snapshot());$('#stock-ok').click();
  assert($('#stock-form').elements.stockpile.getAttribute('aria-invalid')==='true','Invalid legacy rename allowed');
  assert(JSON.stringify(await db.snapshot())===invalidEditSnapshot,'Invalid edit wrote data');$('#stock-cancel').click();
  $('#stock-add').click();
  assert(!$('#stock-form [aria-invalid=true]'),'Untouched fields show errors');
  const invalidSnapshot=JSON.stringify(await db.snapshot());
  set({stockpile:'ss-14',pileId:'S14_',dome:'POP_DOME_1',destination:'POP DEST 1'});
  const stockControl=$('#stock-form').elements.stockpile;
  stockControl.dispatchEvent(new Event('blur'));
  assert(stockControl.value==='ss-14'&&stockControl.getAttribute('aria-invalid')==='true','Blur coerced or accepted invalid Stockpile');
  assert(stockControl.getAttribute('aria-describedby')==='stock-stockpile-error'&&!$('#stock-stockpile-error').hidden,'Accessible field message missing');
  $('#stock-ok').click();assert(document.activeElement===stockControl,'Wrong invalid Stockpile focus');
  set({stockpile:'SS_14'});$('#stock-ok').click();
  assert(document.activeElement===$('#stock-form').elements.pileId&&$('#stock-form').elements.pileId.getAttribute('aria-invalid')==='true','Wrong invalid Pile focus');
  assert(JSON.stringify(await db.snapshot())===invalidSnapshot,'Invalid submit changed database');
  // The service also rejects bypass attempts atomically.
  try {await db.saveStockPair({stockpile:'SS-14',pileId:'S14_38',dome:'POP_DOME_1',destination:'POP DEST 1'});throw Error('Invalid service write accepted');}
  catch(e){assert(e.fields?.stockpile,'Service validation missing');}
  assert(JSON.stringify(await db.snapshot())===invalidSnapshot,'Invalid service write changed database');
  $('#stock-cancel').click();$('#stock-back').click();$('#stock-close').click();
  open();assert($('#stock-dialog').open,'Stock popup missing');assert(!$('#save-entry').checkVisibility(),'Fixed save visible under popup');
  assert([...$('#stock-body').querySelectorAll('button')].every(b=>b.textContent===(()=>{const m=state.masters.find(m=>m.id===b.dataset.stockSelect);return `${m.stockpile} / ${m.pileId}`;})()),'Choice labels expose metadata');
  assert(!/Source Code|sourceCode/.test($('#stock-body').textContent),'Visible Source Code');
  const first=$('#stock-body [data-stock-select]');if(first){first.click();await until(()=>!$('#stock-dialog').open,'Select did not close popup');await flushDraft();}
  else $('#stock-close').click();
  manage();$('#stock-add').click();
  assert($('#stock-form').querySelectorAll('input,select').length===4,'Add form must have four fields');
  assert($('#stock-form').elements.dome.closest('label').textContent==='Product Code','Stock material label');
  set({stockpile:'SS_99',pileId:'S99_01',dome:'POP_DOME_1',destination:'POP DEST 1'});$('#stock-cancel').click();
  assert(!state.masters.some(m=>m.pileId==='S99_01'),'Cancel saved changes');
  $('#stock-add').click();set({stockpile:' SS_99 ',pileId:' S99_02 ',dome:'POP_DOME_1',destination:'POP DEST 1'});await save();
  let added=state.masters.find(m=>m.pileId==='S99_02'&&m.active!==false);
  assert(added&&added.sourceCode==='','New pile without Source failed');
  assert(!state.records.some(r=>r.pileId==='S99_02'),'New pile required import');
  assert($('#entry-form').elements.dome.value==='POP_DOME_1'&&$('#entry-form').elements.destination.value==='POP DEST 1'&&$('#entry-form').elements.productCode.value==='','Add autofill failed');
  $('#stock-back').click();find('[data-stock-select]','S99_02').click();await until(()=>!$('#stock-dialog').open,'Selection did not close');await flushDraft();
  assert($('#product-summary').textContent==='POP_DOME_1 / POP DEST 1','Autofill display failed');
  const manual=$('#choose-product');manual.click();document.querySelector(`[data-product-select="${state.masters.find(m=>m.dome==='POP_DOME_2'&&m.kind==='product').id}"]`).click();await flushDraft();renderOperational();
  assert($('#entry-form').elements.productCode.value===''&&$('#product-summary').textContent.includes('POP_DOME_2'),'Unrelated rerender overwrote manual mapping');
  manage();find('[data-stock-edit]','S99_02').click();set({stockpile:'LS_46',pileId:'L46_PL02',dome:'POP_DOME_2',destination:'POP DEST 2'});await save();
  added=state.masters.find(m=>m.id===added.id);
  assert(added.stockpile==='LS_46'&&added.pileId==='L46_PL02','Identity edit failed');
  assert($('#entry-form').elements.dome.value==='POP_DOME_2'&&$('#entry-form').elements.destination.value==='POP DEST 2'&&$('#entry-form').elements.productCode.value==='','Selected mapping did not sync');
  assert(!stockPairs(state.masters).some(m=>m.pileId==='S99_02'),'Old active identity remained');
  $('#stock-add').click();set({stockpile:'LS_46',pileId:'L46_PL02',dome:'POP_DOME_1',destination:'POP DEST 1'});await save();
  assert(!$('#stock-error').hidden&&$('#stock-error').textContent.includes('sudah tersedia'),'Duplicate pair accepted');$('#stock-cancel').click();
  $('#stock-add').click();set({stockpile:'SS_99',pileId:'S99_03',dome:'POP_DOME_1',destination:'POP DEST 1'});await save();
  find('[data-stock-delete]','S99_03').click();await until(()=>$('#confirm-dialog').open,'Delete confirmation missing');
  $('#confirm-dialog button[value=cancel]').click();await wait(50);assert(stockPairs(state.masters).some(m=>m.pileId==='S99_03'),'Cancel delete removed pair');
  find('[data-stock-delete]','S99_03').click();await until(()=>$('#confirm-dialog').open,'Delete confirm missing');$('#confirm-ok').click();
  await until(()=>!stockPairs(state.masters).some(m=>m.pileId==='S99_03'),'Delete did not hide pair');await flushDraft();
  assert(!$('#entry-form').elements.pileId.value&&!$('#entry-form').elements.dome.value,'Deleted selection not cleared');
  $('#stock-add').click();set({stockpile:'SS_99',pileId:'S99_04',dome:'POP_DOME_NEW',destination:'POP DEST 1'});await save();
  assert(state.masters.some(m=>m.pileId==='S99_04'&&m.active!==false),'Unknown Product should allow pair save');
  assert(!$('#entry-form').elements.productCode.value,'Product guessed for unknown dome');
  $('#stock-back').click();$('#stock-close').click();
  $('#entry-form').elements.dtNo.value='98888';$('#entry-form').elements.dtNo.dispatchEvent(new Event('input',{bubbles:true}));
  $('#save-entry').click();await until(()=>!$('#entry-error').hidden,'Missing Product save was not blocked');assert($('#entry-error').textContent.includes('Product Code'),'Unclear Product error');
  assert(!(await db.all('records')).some(r=>r.dtNo==='SAP_98888'),'Invalid record saved');
  // Exact pair conflict must remain unresolved, never choose an arbitrary Product.
  await db.saveMaster({kind:'product',productCode:'99',dome:'POP_DOME_1',destination:'POP DEST 1'});state.masters=await db.all('masters');
  assert(!!resolveProduct('POP_DOME_1','POP DEST 1',state.masters),'Legacy column 7 incorrectly blocks mapping');
  const ambiguous=await db.saveStockPair({stockpile:'SS_99',pileId:'S99_05',dome:'POP_DOME_1',destination:'POP DEST 1'});
  state.masters=await db.all('masters');open();find('[data-stock-select]','S99_05').click();await until(()=>!$('#stock-dialog').open,'Ambiguous selection close');await flushDraft();assert(!$('#entry-form').elements.productCode.value,'Ambiguous Product autofilled');
  const before=JSON.stringify(await db.all('masters'));
  try{await db.saveStockPair({...added,dome:'POP_DOME_1'},{...added,updatedAt:'stale'});throw Error('Stale accepted');}catch(e){assert(e.message.includes('berubah'),'Unexpected stale failure');}
  assert(JSON.stringify(await db.all('masters'))===before,'Stale write changed masters');
  const atomicBefore=await db.snapshot(), transaction=db.transaction;
  db.transaction=function(names,mode,work){return transaction.call(this,names,mode,async stores=>{const result=await work(stores);throw Error('TEST pair atomic abort');});};
  try{await db.saveStockPair({...added,dome:'POP_DOME_1'},added);throw Error('Abort accepted');}catch(e){assert(e.message.includes('TEST pair atomic abort'),e.message);}finally{db.transaction=transaction;}
  assert(JSON.stringify(await db.snapshot())===JSON.stringify(atomicBefore),'Pair abort changed masters/audit');
  // Editing/deleting leaves every original record and its nested snapshots byte-for-byte intact.
  assert(JSON.stringify(await db.all('records'))===oldRecords,'History mutated by master management');
  for(const r of state.records){const cols=exportLine(r).split('\t');assert(cols.length===11&&cols[2]===''&&cols[5]===''&&cols[6]===''&&cols[7]===r.dome,'Wrong WA column contract');}
  assert(!sessionReport(state.records,state.session).error,'Report regression');
  open();find('[data-stock-select]','L46_PL02').click();await until(()=>!$('#stock-dialog').open,'Valid selection close');await flushDraft();
  for(const [k,v]of Object.entries({dtNo:'98887',time:'09.17'})){$('#entry-form').elements[k].value=v;$('#entry-form').elements[k].dispatchEvent(new Event('input',{bubbles:true}));}
  $('#save-entry').click();await until(()=>state.records.some(r=>r.dtNo==='SAP_98887')&&!$('#entry-fields').disabled,'New pile cannot save ritase');
  const newTrip=state.records.find(r=>r.dtNo==='SAP_98887');assert(newTrip.productCode===''&&newTrip.sourceCode===''&&newTrip.pileId==='L46_PL02','New pile ritase fields wrong');
  const beforeMasterEdit=JSON.stringify(await db.all('records'));
  const changedAgain=await db.saveStockPair({...added,stockpile:'LS_46'},added);
  await db.saveStockPair(changedAgain,changedAgain,true);
  assert(JSON.stringify(await db.all('records'))===beforeMasterEdit,'New trip snapshot changed after master edit/delete');
  // Retain an active renamed pair for the reload assertion.
  await db.saveStockPair({stockpile:'LS_46',pileId:'L46_PL02',dome:'POP_DOME_2',destination:'POP DEST 2'});
  // Confirm the reset contract in a separate synthetic database, never user storage.
  const reset=await Database.open(indexedDB,'rkef-stock-reset-test-'+crypto.randomUUID());
  await reset.put('cache',cache);await reset.put('cache',{id:'checkers',values:[],syncedAt:new Date().toISOString()});
  await reset.put('masters',ambiguous);await reset.endSession(null,null);
  assert(!(await reset.all('masters')).length&&(await reset.all('cache')).length===2,'Reset retained local pair or removed Google caches');reset.db.close();
  sessionStorage.setItem('stock-test-records',JSON.stringify(await db.all('records')));sessionStorage.setItem('stock-test-reload','yes');
  db.db.close();document.activeElement?.blur();
  return 'PASS popup one-tap selection, four fields, Add new pile, Cancel, edit identity/target, manual override, duplicate rejection, confirmed soft delete, missing mapping blocks save; legacy numeric variants accepted, exact TSV 11 fields, stale write protection, frozen history, selective reset';
})()
