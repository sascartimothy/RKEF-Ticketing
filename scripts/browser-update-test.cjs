'use strict';
// Real two-build lifecycle, temporary public-only fixture and fresh Chromium profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {FRONTEND_FILES} = require('./public-files.cjs');
const {createServer} = require('./serve-app.cjs');
const root = path.resolve(__dirname,'..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'rkef-update-test-'));
const fixture = path.join(temp,'public'), profile = path.join(temp,'profile');
const browser = process.env.RKEF_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const pause = ms=>new Promise(r=>setTimeout(r,ms));
const assert = (v,m)=>{if(!v)throw Error(m);};
let server, chrome, main, peer;
async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let seq=0;
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='ServiceWorker.workerErrorReported')console.error('WORKER ERROR',m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);}};
  const command = (method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  if(target.type==='page') {
    await command('Page.enable');await command('Network.enable');
    await command('ServiceWorker.enable');
    await command('Network.setBlockedURLs',{urls:['https://*']});
  }
  return {command,evaluate,socket};
}
async function until(page,expression,label) {
  for(let i=0;i<300;i++){try{if(await page.evaluate(expression))return;}catch{}await pause(100);}
  throw Error('Timeout '+label+' '+await page.evaluate("document.querySelector('#update-state')?.textContent"));
}
const ready = async page=>{
  await until(page,"document.readyState==='complete' && document.querySelector('#main') && !document.querySelector('#main').inert",'UI ready');
  assert(await page.evaluate("document.querySelector('#storage-error').hidden"),'Storage initialization failed: '+await page.evaluate("document.querySelector('#storage-error').textContent"));
};
const status = (page,value)=>until(page,`document.querySelector('#update-state')?.dataset.state===${JSON.stringify(value)}`,value);
const snapshot = page=>page.evaluate("(async()=>{const {Database}=await import('./js/database.js');const db=await Database.open();const data=await db.snapshot();db.db.close();return JSON.stringify(data);})()");
(async()=>{
  try {
    assert(browser,'No Chromium executable');
    for(const name of FRONTEND_FILES){const dest=path.join(fixture,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,name),dest);}
    fs.appendFileSync(path.join(fixture,'styles.css'),'\n/* synthetic build A */\n');
    server=createServer({root:fixture,development:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${server.address().port}/RKEF-Ticketing/`;
    chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<150&&!fs.existsSync(portFile);i++)await pause(100);
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const targets=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
    main=await connect((await targets()).find(t=>t.type==='page'));
    await main.command('Page.navigate',{url:base});await ready(main);
    await until(main,'!!navigator.serviceWorker.controller','first worker control');
    await main.command('Page.reload');await ready(main);await status(main,'current');
    const buildA=await main.evaluate("navigator.serviceWorker.controller.scriptURL");
    console.log('PASS real Build A installed, controlled and verified against server');
    // Exercise real DB APIs with valid synthetic records, mapping, session and audit.
    await main.evaluate(`(async()=>{
      const {Database}=await import('./js/database.js');const {parseWA}=await import('./js/wa-parser.js');const {deriveMappings}=await import('./js/master-data.js');
      const db=await Database.open();
      const record={...parseWA(['46315','TEST_DT','6','TEST_STOCK','TEST_PILE','','5','TEST_DOME','TEST DESTINATION','06.59','BDM'].join('\t'))[0].record,id:crypto.randomUUID(),shift:'DS',checker:'TEST CHECKER',origin:'local'};
      await db.saveSession({operationDate:'2026-10-20',shift:'DS',scale:'BDM',checker:'TEST CHECKER',handoverConfirmed:true,handoverId:'synthetic-update-session',nextNumber:1,nextRitase:'46315-001'});
      for(const m of deriveMappings([record],[]))await db.saveMaster(m);
      await db.saveRecord(record,{draftId:'update-test',sourceTime:'06.58'});
      await db.put('cache',{id:'destinations',values:[],syncedAt:new Date().toISOString()});
      await db.put('cache',{id:'checkers',values:[],syncedAt:new Date().toISOString(),listVersion:'a'.repeat(64)});
      await db.put('pending',{id:'destination',name:'PENDING TEST',requestId:'test_pending_0123456789',createdAt:new Date().toISOString(),state:'pending'});
      await db.put('imports',{id:'a'.repeat(64),at:new Date().toISOString(),count:1});
      db.db.close();
    })()`);
    await main.command('Page.reload');await ready(main);await status(main,'current');
    await main.evaluate("location.hash='operasional'");
    await until(main,"!document.querySelector('#view-operasional').hidden",'draft form');
    await main.evaluate("(async()=>{const field=document.querySelector('#entry-form').elements.dtNo;field.value='PERSISTENT DRAFT';field.dispatchEvent(new Event('input',{bubbles:true}));await (await import('./js/operational-ui.js')).flushDraft();location.hash='setup';})()");
    // UI-only WA text represents unsaved work; every store snapshot also compared exactly.
    await main.evaluate("document.querySelector('#wa-source').value='UNSAVED UPDATE TEST';sessionStorage.setItem('updateLoads','0')");
    const before=await snapshot(main);
    const cachesA=await main.evaluate('caches.keys()');
    const qa=path.join(root,'private-data/qa');fs.mkdirSync(qa,{recursive:true});
    for(const width of [320,360,390,430,1280]){
      await main.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      assert(await main.evaluate("(()=>{const row=document.querySelector('.app-version-row'),title=document.querySelector('#app-version').getBoundingClientRect(),b=document.querySelector('#update-app').getBoundingClientRect(),s=document.querySelector('#update-state').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&b.right<=innerWidth&&b.left>=title.right&&s.top>=row.getBoundingClientRect().bottom;})()"),'Update layout overflow '+width);
      await main.evaluate("document.querySelector('#version-card').scrollIntoView({block:'center'})");
      fs.writeFileSync(path.join(qa,`update-setup-${width}.png`),Buffer.from((await main.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    await main.evaluate("document.querySelector('#version-card details').open=true");
    assert(await main.evaluate("document.querySelector('#build-info').checkVisibility()"),'Diagnostics unavailable');
    // Offline must never display current.
    await main.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await main.evaluate("document.querySelector('#update-app').click()");await status(main,'offline');
    await main.command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await until(main,'navigator.onLine && !document.querySelector("#update-app").disabled','online');
    // Broken server metadata must fail without cache deletion or reload.
    const workerSource=fs.readFileSync(path.join(fixture,'sw.js'));
    fs.writeFileSync(path.join(fixture,'sw.js'),'<html>not a worker</html>');
    await main.evaluate("document.querySelector('#update-app').click()");await status(main,'error');
    fs.writeFileSync(path.join(fixture,'sw.js'),workerSource);
    assert(JSON.stringify(await main.evaluate('caches.keys()'))===JSON.stringify(cachesA),'Failed check deleted caches');
    fs.appendFileSync(path.join(fixture,'styles.css'),'\n/* synthetic build B, unchanged appVersion */\n');
    await main.evaluate("document.querySelector('#update-app').click();document.querySelector('#update-app').click()");
    await until(main,"document.querySelector('#update-dialog').open",'confirmation');
    assert(await main.evaluate("document.activeElement.id==='update-cancel'"),'Cancel focus');
    await main.command('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
    fs.writeFileSync(path.join(qa,'update-confirm-360.png'),Buffer.from((await main.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await main.evaluate("document.querySelector('#update-cancel').click()");await status(main,'available');
    assert(await main.evaluate("document.querySelector('#wa-source').value==='UNSAVED UPDATE TEST'"),'Cancel lost unsaved work');
    assert(await snapshot(main)===before,'Cancel changed persistent data');
    assert(JSON.stringify(await main.evaluate('caches.keys()'))===JSON.stringify(cachesA),'Cancel changed caches');
    assert(await main.evaluate('navigator.serviceWorker.controller.scriptURL')===buildA,'Cancel changed controller');
    console.log('PASS five Setup widths, diagnostics, offline, corrupt server metadata, same-version B detection, Cancel preserves work/cache/database');
    const peerTarget=await main.command('Target.createTarget',{url:'about:blank'});
    peer=await connect((await targets()).find(t=>t.id===peerTarget.targetId));
    await peer.command('Page.navigate',{url:base});await ready(peer);
    await peer.evaluate("document.querySelector('#wa-source').value='PEER WORK'");
    await main.command('Page.bringToFront');
    await main.evaluate("document.querySelector('#update-app').click()");await until(main,"document.querySelector('#update-dialog').open",'multi-tab confirmation');
    await main.evaluate("document.querySelector('#update-dialog button[value=ok]').click()");await status(main,'blocked');
    assert(await peer.evaluate("document.querySelector('#wa-source').value==='PEER WORK'"),'Peer forced reload');
    assert(await main.evaluate('navigator.serviceWorker.controller.scriptURL')===buildA,'Blocked update activated');
    await main.command('Target.closeTarget',{targetId:peerTarget.targetId});peer.socket.close();peer=null;
    await main.command('Page.addScriptToEvaluateOnNewDocument',{source:"sessionStorage.setItem('updateLoads',String(Number(sessionStorage.getItem('updateLoads')||0)+1))"});
    await main.evaluate("document.querySelector('#update-app').click()");await until(main,"document.querySelector('#update-dialog').open",'install confirmation');
    await main.evaluate("document.querySelector('#update-dialog button[value=ok]').click()");
    await until(main,"Number(sessionStorage.getItem('updateLoads'))===1",'single controlled reload');await ready(main);await status(main,'current');
    const buildB=await main.evaluate('navigator.serviceWorker.controller.scriptURL');
    assert(buildA!==buildB,'B never activated');
    assert(await snapshot(main)===before,'Update changed saved stores');
    const cachesB=await main.evaluate('caches.keys()');
    assert(cachesB.length===1&&!cachesB.includes(cachesA[0]),'Old shell not cleaned');
    await pause(600);assert(await main.evaluate("sessionStorage.getItem('updateLoads')")==='1','Reload loop');
    await main.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await main.command('Page.reload');await ready(main);await status(main,'offline');
    assert(await main.evaluate('navigator.serviceWorker.controller.scriptURL')===buildB,'Offline lost B');
    assert(await snapshot(main)===before,'Offline lost persistent stores');
    console.log('PASS real A → B waiting/activation/controller/reload once, multi-tab block without peer reload, every IndexedDB store byte-preserved, owned cache cleanup, offline B reload');
    console.log('Screenshots: private-data/qa/update-*.png');
  } finally {
    peer?.socket.close();
    if(main){try{await main.command('Browser.close');}catch{}main.socket.close();}
    chrome?.kill();server?.close();server?.closeAllConnections();await pause(500);
    const resolved=path.resolve(temp);
    if(path.dirname(resolved)===fs.realpathSync(os.tmpdir())&&path.basename(resolved).startsWith('rkef-update-test-'))try{fs.rmSync(resolved,{recursive:true,force:true});}catch{}
  }
})().catch(error=>{console.error('FAIL update browser test',error);process.exitCode=1;});
