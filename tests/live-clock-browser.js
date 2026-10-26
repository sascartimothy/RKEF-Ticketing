(async () => {
  const { Database } = await import('./js/database.js');
  const { state, clone } = await import('./js/state.js');
  const { ensureDraft, fillDraft, flushDraft, renderOperational } = await import('./js/operational-ui.js');
  const { localTimeSeconds, localDate } = await import('./js/time-date.js');
  const { exportLine } = await import('./js/wa-exporter.js');
  const $ = s => document.querySelector(s), form = $('#entry-form'), time = form.elements.time;
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const equal = (a,b,message) => assert(JSON.stringify(a) === JSON.stringify(b), message + ': ' + JSON.stringify(a));
  const wait = ms => new Promise(r => setTimeout(r,ms));
  const until = async fn => { for(let i=0;i<200;i++){if(await fn())return;await wait(30);}throw Error('Clock UI timeout: '+$('#entry-error').textContent); };
  const input = (el,value) => { el.value=value;el.dispatchEvent(new Event('input',{bubbles:true})); };
  await until(()=>state.ready);
  const db = await Database.open(), stage = sessionStorage.getItem('clockStage');
  if (stage === 'auto') {
    equal(state.draft.timeMode,'auto','Reload lost AUTO');
    equal(form.elements.note.value,'AUTO RELOAD','Reload lost other field');
    assert(time.value !== '01.02.03','Reload restored frozen AUTO time');
    const old=time.value;await wait(1150);assert(time.value!==old,'Reload AUTO not ticking');
    input(time,'72035');await flushDraft();sessionStorage.setItem('clockStage','manual');db.db.close();
    return 'PASS actual reload restores AUTO clock with current device time';
  }
  if (stage === 'manual') {
    equal(state.draft.timeMode,'manual','Reload lost MANUAL');equal(time.value,'72035','Reload lost raw manual time');
    await wait(1150);equal(time.value,'72035','Reload manual clock overwritten');
    await db.restore(JSON.parse(sessionStorage.getItem('clockBaseline')),'replace');
    sessionStorage.removeItem('clockStage');sessionStorage.removeItem('clockBaseline');db.db.close();
    return 'PASS actual reload preserves MANUAL draft; synthetic baseline restored';
  }
  sessionStorage.setItem('clockBaseline',JSON.stringify(await db.backup()));
  location.hash='operasional';await until(()=>!$('#view-operasional').hidden);
  ensureDraft(true);
  const RealDate=Date;let instant=new RealDate(2026,9,21,14,25,10).getTime();
  globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[instant]));} static now(){return instant;} };
  const originalSaveDraft=Database.prototype.saveDraft, originalSaveRecord=Database.prototype.saveRecord;
  let writes=0;
  Database.prototype.saveDraft=function(value){writes++;return originalSaveDraft.call(this,value);};
  try {
    fillDraft();equal(time.value,'14.25.10','AUTO current device time');
    input(form.elements.note,'CLOCK NOTE');await flushDraft();const count=writes, draft=clone(state.draft);
    time.focus();time.click();instant+=1000;await wait(1100);equal(time.value,'14.25.11','Focus/click stopped clock');
    instant+=4000;await wait(1100);equal(time.value,'14.25.15','Clock used counter instead of device time');
    equal(writes,count,'AUTO ticks wrote drafts');equal(state.draft,draft,'AUTO tick dirtied draft');equal(form.elements.note.value,'CLOCK NOTE','Tick erased field');
    input(time,'14.20');await flushDraft();instant+=2000;renderOperational();await wait(1100);equal(time.value,'14.20','Manual overwritten');
    equal(state.draft.timeMode,'manual','Manual mode');
    input(time,'');time.focus();
    time.dispatchEvent(new ClipboardEvent('paste',{bubbles:true}));
    time.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertFromPaste',data:null}));
    time.setRangeText('720',time.selectionStart,time.selectionEnd,'end');
    time.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:null}));
    equal(time.value,'720','Paste appended to AUTO');time.blur();equal(time.value,'07.20','Pasted digits not normalized');
    input(time,'');time.focus();time.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    time.setRangeText('072035',time.selectionStart,time.selectionEnd,'end');
    time.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'072035',isComposing:true}));
    time.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'072035'}));
    equal(time.value,'072035','Composition digits changed');equal(state.draft.timeMode,'manual','Composition did not set MANUAL');
    time.blur();equal(time.value,'07.20.35','Composition normalization');
    for (const [raw, expected] of [['720','07.20'],['0720','07.20'],['72035','07.20.35'],['072035','07.20.35'],['142530','14.25.30'],['235959','23.59.59'],['7.2','07.20'],['13.3','13.30'],['15','15.00']]) {
      time.focus();input(time,raw);equal(time.value,raw,'Typing was reformatted before blur');
      time.blur();await flushDraft();equal(time.value,expected,'Blur formatting');equal(state.draft.values.time,expected,'Normalized draft');
    }
    time.focus();input(time,'142530');time.setSelectionRange(2,4);time.setRangeText('20',2,4,'end');time.dispatchEvent(new Event('input',{bubbles:true}));
    equal(time.value,'142030','Middle edit changed digits');equal(time.selectionStart,4,'Middle edit moved caret');
    time.setRangeText('',3,4,'end');time.dispatchEvent(new Event('input',{bubbles:true}));equal(time.value,'14230','Backspace changed other digits');equal(time.selectionStart,3,'Backspace moved caret');
    input(time,'07.');time.blur();await flushDraft();equal(time.value,'07.','Invalid partial erased');equal(state.draft.timeMode,'manual','Partial changed mode');
    for(const whitespace of ['', '   ', '\t\n']) {
      input(time,whitespace);await flushDraft();equal(state.draft.timeMode,'auto','Whitespace did not resume AUTO');equal(time.value,localTimeSeconds(),'Whitespace AUTO display');
      instant+=1000;await wait(1100);equal(time.value,localTimeSeconds(),'Resumed clock frozen');
    }
    // Populate approved pairs, leave time AUTO and delay the draft flush past submit.
    for(const kind of ['stock','product']) {if(kind==='stock'){$('#choose-stock').click();$('#stock-body [data-stock-select]').click();continue;}$('#choose-product').click();$('#product-body [data-product-select]').click();}
    input(form.elements.dtNo,'97001');await flushDraft();
    let release, entered=false;
    Database.prototype.saveDraft=async function(value){entered=true;await new Promise(r=>release=r);return originalSaveDraft.call(this,value);};
    input(form.elements.note,'DELAYED AUTO');await until(()=>entered);
    instant=new RealDate(2026,9,21,14,27,38).getTime();
    let submitted;
    Database.prototype.saveRecord=async function(data,options){submitted=clone({data,options});instant+=5000;await wait(30);return originalSaveRecord.call(this,data,options);};
    form.requestSubmit();instant+=7000;release();
    await until(()=>state.records.some(r=>r.dtNo==='SAP_97001')&&!$('#entry-fields').disabled);
    equal(submitted.data.time,'14.27.38','Time not captured before async flush');equal(submitted.options.clockDate,'2026-10-21','Capture date');
    const auto=state.records.find(r=>r.dtNo==='SAP_97001');equal(auto.time,'14.27.38','Save delay changed AUTO');equal(auto.timePrecision,'second','Second metadata');equal(auto.sourceTime,'14.27.38','Source time');equal(auto.editedTime,auto.time,'Audit time');equal(state.draft.timeMode,'auto','Next draft not AUTO');
    Database.prototype.saveDraft=originalSaveDraft;Database.prototype.saveRecord=originalSaveRecord;
    for(const kind of ['stock','product']) {if(kind==='stock'){$('#choose-stock').click();$('#stock-body [data-stock-select]').click();continue;}$('#choose-product').click();$('#product-body [data-product-select]').click();}
    input(form.elements.dtNo,'97002');input(time,'1425');await flushDraft();form.requestSubmit();
    await until(()=>state.records.some(r=>r.dtNo==='SAP_97002')&&!$('#entry-fields').disabled);
    const manual=state.records.find(r=>r.dtNo==='SAP_97002');equal(manual.time,'14.25','Manual save used device time');equal(manual.timePrecision,'minute','Unknown seconds invented');
    // Historical correction remains static and preserves every field of the new draft.
    input(form.elements.note,'KEEP NEW DRAFT');input(time,'13.13.13');await flushDraft();const kept=clone(state.draft);
    $(`[data-edit="${auto.id}"]`).click();await until(()=>$('#correction-dialog').open);
    equal($('#correction-form').elements.time.value,auto.time,'Correction did not show historical time');instant+=10000;await wait(1100);equal($('#correction-form').elements.time.value,auto.time,'Correction ticked');
    input($('#correction-form').elements.time,'142459');$('#correction-form').requestSubmit();await until(()=>!$('#correction-dialog').open);
    equal(state.draft,kept,'Correction changed entry draft');equal(time.value,'13.13.13','Correction changed manual field');
    const changed=state.records.find(r=>r.id===auto.id);equal(changed.ritaseNumber,manual.ritaseNumber,'Second correction did not reorder');
    assert((await db.all('audit')).some(a=>a.action==='correct'&&a.recordId===auto.id&&a.before.time==='14.27.38'&&a.after.time==='14.24.59'),'Time audit missing');
    // Real transaction failure after writes must roll back record, peer numbers, counter and audit.
    const before=await db.snapshot(), transaction=Database.prototype.transaction;
    Database.prototype.transaction=function(names,mode,work){return transaction.call(this,names,mode,async stores=>{const result=await work(stores);if(mode==='readwrite'&&names.includes('records')&&names.includes('audit'))throw Error('TEST clock abort');return result;});};
    try {await db.saveRecord({...changed,time:'14.23.01'}, {expectedRevision:changed.revision});throw Error('Abort accepted');}catch(e){assert(e.message.includes('TEST clock abort'),e.message);}finally{Database.prototype.transaction=transaction;}
    equal(await db.snapshot(),before,'Abort consumed number or mutated data');
    const backup=await db.backup(), restored=await Database.open(indexedDB,'rkef-clock-restore-'+crypto.randomUUID());
    await restored.restore(backup);equal(await restored.snapshot(),backup.stores,'Restore lost seconds, precision or audit');restored.db.close();
    for(const [value,expected] of [['14.25.59','14.25'],['23.59.59','23.59']])equal(exportLine({...changed,time:value}).split('\t')[9],expected,'WA rounding');
    // Three observations in one minute commit in second order and correct atomically.
    const numbered=await Database.open(indexedDB,'rkef-clock-order-'+crypto.randomUUID());
    const numberSession={...state.session,startNumber:84,nextNumber:84,nextRitase:'46316-084',handoverId:'clock-seconds'};
    await numbered.saveSession(numberSession);
    for(const m of state.masters.filter(m=>['stock','product'].includes(m.kind)))await numbered.put('masters',m);
    const make=(dt,t)=>({...auto,id:crypto.randomUUID(),dtNo:dt,time:t,ritaseNumber:undefined,numberingSession:undefined,activationId:numberSession.activationId,handoverId:numberSession.handoverId});
    const three=[];
    for(const [dt,t] of [['SAP_880','14.25.12'],['SAP_881','14.25.38'],['SAP_882','14.25.51']])three.push(await numbered.saveRecord(make(dt,t),{draftId:dt}));
    equal(three.map(r=>r.ritaseNumber),[84,85,86],'Second order numbering');
    const moved=await numbered.saveRecord({...three[2],time:'14.25.20'},{expectedRevision:1});
    equal(moved.id,three[2].id,'Second reorder changed UUID');equal(moved.ritaseNumber,85,'Second reorder number');equal((await numbered.get('records',three[1].id)).ritaseNumber,86,'Second peer number');
    const tied=[await numbered.saveRecord(make('SAP_883','14.25.20'),{draftId:'tie-a'}),await numbered.saveRecord(make('SAP_884','14.25.20'),{draftId:'tie-b'})];
    const orderBefore=(await numbered.all('records')).map(r=>[r.id,r.ritaseNumber]);
    const numberedBackup=await numbered.backup();await numbered.restore(numberedBackup,'replace');equal((await numbered.all('records')).map(r=>[r.id,r.ritaseNumber]),orderBefore,'Tie order changed on restore');
    const tiedIds = new Set(tied.map(r => r.id));
    equal((await numbered.all('records')).filter(r => tiedIds.has(r.id)).sort((a,b) => a.ritaseNumber-b.ritaseNumber).map(r => r.id), [...tied].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(r => r.id), 'Identical-second tie unstable');numbered.db.close();
    // Validation failure leaves draft, records and number intact.
    input(form.elements.dtNo,'97003');await flushDraft();
    const failedBefore=await db.snapshot();
    for (const invalid of ['25.00.00','07.','1260','235960']) {
      input(time,invalid);await flushDraft();form.requestSubmit();await until(()=>!$('#entry-error').hidden&&!$('#entry-fields').disabled);
      assert($('#entry-error').textContent.includes('Jam harus'),'Missing invalid-time error');equal(time.value,invalid,'Invalid input replaced');
      equal(await db.all('records'),failedBefore.records,'Invalid save created record');equal((await db.get('settings','session')).value,failedBefore.settings.find(r=>r.id==='session').value,'Validation consumed number');
    }
    // Leave an AUTO dirty draft to verify real reload recovery in the next stage.
    input(time,'');input(form.elements.note,'AUTO RELOAD');await flushDraft();
    const persisted=(await db.get('settings','draft'));persisted.value.values.time='01.02.03';await db.put('settings',persisted);
    assert(document.documentElement.scrollWidth<=360,'Clock caused 360px overflow');
    sessionStorage.setItem('clockStage','auto');
  } finally {globalThis.Date=RealDate;Database.prototype.saveDraft=originalSaveDraft;Database.prototype.saveRecord=originalSaveRecord;db.db.close();}
  return 'PASS live device clock/focus/manual/whitespace, zero tick writes, delayed save capture, manual minute precision, static correction/draft isolation, atomic rollback, seconds backup/restore, WA truncation and 360px layout';
})()
