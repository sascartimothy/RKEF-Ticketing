(async () => {
  const {Database} = await import('./js/database.js');
  const {state} = await import('./js/state.js');
  const db = await Database.open();
  const assert = (ok,msg) => { if (!ok) throw Error(msg); };
  const equal = (a,b,msg) => assert(JSON.stringify(a)===JSON.stringify(b),msg);
  const until = async fn => { for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Total reset timeout'); };
  await until(()=>state.ready);
  sessionStorage.setItem('reuseBaseline',JSON.stringify(await db.backup()));
  const source = Array.from({length:83},(_,i)=>[`46315-${String(i+1).padStart(3,'0')}`,`SAP_${900+i}`,'4','RESET_STOCK','RESET_PILE','','1','RESET_DOME','RESET DESTINATION','7.2','BDM'].join('\t')).join('\n');
  await db.importHandover({source});
  await db.importHandover({source:source.replaceAll('BDM','ONI')});
  const session = (await db.get('settings','session')).value;
  const checkers = {id:'checkers',syncedAt:new Date().toISOString(),values:Array.from({length:17},(_,i)=>({checker_id:'CHK-reset-'+i,name:'RESET CHECKER '+i,is_active:true,version:1,request_id:''}))};
  const destinations = {id:'destinations',syncedAt:new Date().toISOString(),values:[{destination_id:'DST-RESET',destination_name:'RESET DESTINATION',request_id:''}]};
  for(const cache of [checkers,destinations,{id:'old-operational-cache',value:'discard'}])await db.put('cache',cache);
  const imported = (await db.all('records'))[0];
  const local = {...imported,id:'old-local',origin:'local',shift:session.shift,checker:'RESET HISTORIC',ritaseNumber:84,numberingSession:session.handoverId,activationId:session.activationId,sourceSnapshot:{...imported.sourceSnapshot,checker:'RESET HISTORIC'}};
  await db.put('records',local);
  await db.put('records',{...local,id:'old-tombstone',ritaseNumber:85,deletedAt:new Date().toISOString()});
  await db.put('settings',{id:'old-counter',value:999});
  await db.put('settings',{id:'draft',value:{id:'old-draft',recordId:'old-draft-record',session,dirty:true,sourceTime:'07.20',values:Object.fromEntries(['dtNo','stockpile','pileId','sourceCode','productCode','dome','destination','time','note'].map(k=>[k,k==='time'?'07.20':'']))}});
  await db.put('pending',{id:'destination',name:'PENDING RESET DESTINATION',requestId:'pwa_reset_pending_0123456789',createdAt:new Date().toISOString()});
  // Independent stale connection exists before reset, like another browser tab.
  const stale = await Database.open();
  const stable = await db.snapshot(), transaction = db.transaction;
  db.transaction = function(names,mode,work){return transaction.call(this,names,mode,async stores=>{await work(stores);throw Error('TEST reset rollback');});};
  try {await db.endSession(session,stable.settings.find(s=>s.id==='draft').value);throw Error('Reset did not abort');}
  catch(e){assert(e.message.includes('TEST reset rollback'),e.message);}
  db.transaction=transaction;
  equal(await db.snapshot(),stable,'Reset partially committed');
  // Refresh the UI with the complete, valid synthetic database before resetting.
  const channel = new BroadcastChannel('rkef-ticketing');channel.postMessage('changed');
  await until(()=>state.session?.scale==='ONI');
  document.querySelector('#wa-source').value=source;
  const beforeCancel=await db.snapshot();
  document.querySelector('#new-session').click();await until(()=>document.querySelector('#confirm-dialog').open);
  assert(document.querySelector('#confirm-message').textContent.includes('BDM'), 'Reset warning omits other scale');
  document.querySelector('#confirm-dialog button[value=cancel]').click();await until(()=>!state.sessionTransition);
  equal(await db.snapshot(),beforeCancel,'Cancel changed database');
  equal(document.querySelector('#wa-source').value,source,'Cancel changed WA');
  document.querySelector('#new-session').click();await until(()=>document.querySelector('#confirm-dialog').open);
  document.querySelector('#confirm-ok').click();await until(()=>!state.sessionTransition);
  const reset=await db.snapshot();
  for(const name of ['records','masters','audit','imports','pending'])equal(reset[name],[],name+' survived reset');
  equal(reset.settings.map(s=>s.id),['resetGeneration'],'Operational settings survived');
  equal(reset.cache,[checkers,destinations],'Shared cache lost or unrelated cache retained');
  equal(state.session,null,'Reset auto-activated old WA');equal(state.draft,null,'Draft survived');
  equal(document.querySelector('#wa-source').value,'','WA survived');
  equal(document.querySelector('#report-count').textContent,'0','Report survived');
  for(const write of [()=>stale.put('settings',{id:'session',value:session}),()=>stale.importHandover({source}),()=>stale.saveSession({...session,checker:'OLD'}),()=>stale.put('records',{id:'resurrected'})]) {
    let blocked=false;try{await write();}catch(e){blocked=e.message.includes('direset');}assert(blocked,'Stale connection wrote old data');
  }
  equal(await db.snapshot(),reset,'Stale writes changed reset database');
  stale.db.close();channel.close();db.db.close();
  sessionStorage.setItem('totalResetExpected',JSON.stringify({source,cache:reset.cache}));
  return 'PASS total reset: BDM/ONI imports, settings/counter/draft/audit/tombstone/pending, selective 17-Checker cache, rollback, Cancel, empty UI, stale connection writes';
})()
