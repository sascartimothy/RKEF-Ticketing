(async () => {
  const {state} = await import('./js/state.js');
  const {Database} = await import('./js/database.js');
  const {ensureDraft, fillDraft, flushDraft, renderOperational} = await import('./js/operational-ui.js');
  const $ = s => document.querySelector(s), form = $('#entry-form'), dt = form.elements.dtNo;
  const assert = (v,m) => { if (!v) throw Error('DT keypad: ' + m); };
  const wait = ms => new Promise(r => setTimeout(r,ms));
  const until = async f => { for(let i=0;i<200;i++){if(await f())return;await wait(25);}throw Error('DT keypad timeout: '+$('#entry-error').textContent); };
  const input = value => {dt.value=value;dt.dispatchEvent(new Event('input',{bubbles:true}));};
  const key = value => $(`[data-dt-key="${value}"]`).click();
  const db = await Database.open();
  if (sessionStorage.getItem('keypad-baseline')) {
    try {
      assert(dt.value === 'SAP_82' && state.draft.values.dtNo === dt.value, 'DT draft lost on actual offline reload');
      key('0');assert(dt.value === 'SAP_820' && document.activeElement !== dt, 'offline keypad/focus');
      await flushDraft();
      assert((await db.get('settings','draft')).value.values.dtNo === 'SAP_820', 'offline persistence');
      await db.restore(JSON.parse(sessionStorage.getItem('keypad-baseline')), 'replace');
      sessionStorage.removeItem('keypad-baseline');
      return 'PASS DT keypad actual offline reload, draft recovery and offline input; baseline restored';
    } finally {db.db.close();}
  }
  await flushDraft();sessionStorage.setItem('keypad-baseline',JSON.stringify(await db.backup()));
  try {
    // Dedicated synthetic session; previous local/imported history stays frozen.
    state.session = {...state.session,operationDate:'2026-10-27',shift:'DS',handoverId:'keypad-fixture',activationId:'keypad-fixture',startNumber:1,nextNumber:1,nextRitase:'46322-001'};
    await db.saveSession(state.session);ensureDraft(true);
    location.hash='operasional';await until(()=>!$('#view-operasional').hidden);
    const card=$('.entry-card'), next=$('#entry-next'), buttons=[...$('#dt-keypad').querySelectorAll('button')];
    assert($('#entry-title').textContent==='Ritase baru', 'title');
    assert(!card.querySelector('#entry-context,.context-box'), 'metadata container remains');
    for(const text of [state.session.operationDate,state.session.shift,state.session.scale,state.session.checker]) assert(!text || !card.textContent.includes(text), 'session metadata remains: '+text);
    assert(!next.hidden && next.textContent==='Berikutnya: '+state.session.nextRitase && next.closest('.card-heading'), 'compact next number');
    assert(buttons.map(b=>b.dataset.dtKey).join(',')==='1,2,3,4,5,6,7,8,9,0,backspace', 'key order');
    assert(buttons.every(b=>b.type==='button') && buttons[10].getAttribute('aria-label')==='Hapus satu karakter', 'button semantics');
    const originalSession=state.session;
    for(const session of [null,{...originalSession,nextRitase:undefined}]) {
      state.session=session;renderOperational();assert(next.hidden && !next.textContent, 'fake unavailable number');
      if(!session){key('8');assert(dt.value==='' && $('#save-entry').matches(':disabled') && !$('#no-session').hidden,'inactive entry guard');}
    }
    state.session=originalSession;renderOperational();
    let submits=0, events=0, focusCalls=0;
    const onsubmit=()=>submits++, oninput=()=>events++, nativeFocus=dt.focus;
    form.addEventListener('submit',onsubmit);dt.addEventListener('input',oninput);
    dt.focus=function(){focusCalls++;return nativeFocus.call(this);};
    try {
      nativeFocus.call(dt);key('8');key('2');key('0');
      assert(dt.value==='820' && state.draft.values.dtNo==='820' && events===3,'digits/state/events');
      assert(focusCalls===0 && document.activeElement!==dt && submits===0, 'keypad focus/submit');
      key('backspace');assert(dt.value==='82','backspace');
      for(let i=0;i<5;i++)key('backspace');assert(dt.value==='', 'empty backspace');
      input('SAP_820');key('backspace');assert(dt.value==='SAP_82', 'manual prefix changed');key('0');
      await flushDraft();renderOperational();fillDraft();assert(dt.value==='SAP_820','rerender lost input');
      input('9'.repeat(100));key('8');assert(dt.value.length===100,'maxlength bypass');
    } finally {dt.focus=nativeFocus;form.removeEventListener('submit',onsubmit);dt.removeEventListener('input',oninput);}
    // Choose mapping through existing controls; keypad must preserve every other field.
    $('#choose-stock').click();$('#stock-body [data-stock-select]').click();await flushDraft();
    assert(form.elements.dome.value && form.elements.destination.value, 'existing stock autofill');
    const mapping=JSON.stringify(['stockpile','pileId','dome','destination'].map(k=>form.elements[k].value));
    input('');key('8');key('2');key('0');
    assert(mapping===JSON.stringify(['stockpile','pileId','dome','destination'].map(k=>form.elements[k].value)), 'keypad changed mapping');
    const clock=form.elements.time.value;
    assert(state.draft.timeMode==='auto', 'keypad changed AUTO clock mode');
    await until(()=>form.elements.time.value!==clock);
    // Invalid manual DT still reaches the original save validation.
    input('SAP_SAP_820');await flushDraft();const old=await db.all('records');
    form.requestSubmit();await until(()=>!$('#entry-error').hidden && !$('#entry-fields').disabled);
    assert($('#entry-error').textContent.includes('Nomor DT') && JSON.stringify(await db.all('records'))===JSON.stringify(old),'DT validation bypass');
    input('');key('8');key('2');key('0');await flushDraft();const id=state.draft.recordId;
    form.requestSubmit();await until(()=>state.records.some(r=>r.id===id) && !$('#entry-fields').disabled);
    const saved=state.records.find(r=>r.id===id);
    assert(saved.dtNo==='SAP_820' && saved.ritaseNumber===1,'saved normalization/number');
    assert(next.textContent==='Berikutnya: '+state.session.nextRitase && state.session.nextRitase==='46322-002','next state update after save');
    assert(JSON.stringify((await db.all('records')).filter(r=>r.id!==id))===JSON.stringify(old),'previous history changed');
    input('SAP_820');key('backspace');await flushDraft();
    return 'PASS DT keypad metadata/next state, inactive guards, digits/delete/empty/manual/maxlength, one input event per key, no focus/submit, rerender/draft, mapping, AUTO clock, validation and real normalized save/history';
  } finally { db.db.close(); }
})()
