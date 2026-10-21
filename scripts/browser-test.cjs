'use strict';
// Local Chrome/Edge CDP verification. No browser package and no live Google traffic.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const { createServer } = require('./serve-app.cjs');
const root = path.resolve(__dirname,'..');
let base;
const pause = ms=>new Promise(r=>setTimeout(r,ms));
const browser = process.env.RKEF_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
if (!browser) { console.error('FAIL: Chrome/Edge not found. Set RKEF_BROWSER to a local Chromium executable.'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'rkef-browser-test-'));
let chrome,server,ws;
const pending = new Map(); let seq=0; const errors=[];
async function cdp(method,params={}) {
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},90000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function ready() {
  for(let i=0;i<120;i++) { try { if(await evaluate("document.readyState==='complete' && !!document.querySelector('#session-state') && !document.querySelector('#main').inert")) return; } catch{} await pause(100); }
  throw Error('Page not ready');
}
(async()=>{
  try {
    // Own a root-file server with the production worker on a free port.
    server = createServer({ root, development: false });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/RKEF-Ticketing/`;
    chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<150&&!fs.existsSync(portFile);i++)await pause(100);
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target=targets.find(t=>t.type==='page');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    ws.onmessage=e=>{
      const msg=JSON.parse(e.data);
      if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}}
      if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if(msg.method==='Fetch.requestPaused') {
        const requestId=msg.params.requestId;
        const local=msg.params.request.url.startsWith(new URL(base).origin+'/');
        cdp(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId}:{requestId,errorReason:'BlockedByClient'}).catch(error=>{
          // Navigation/reload can cancel an intercepted request before CDP handles it.
          // An expired ID cannot resume a request. Keep every other protocol error
          // and every Runtime.exceptionThrown fatal; network blocking also remains enabled.
          if (/^Invalid InterceptionId\.?$/.test(error.message)) console.log('INFO canceled request interception expired during navigation');
          else errors.push(error.message);
        });
      }
    };
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    await cdp('Network.setBlockedURLs',{urls:['https://*','http://script.google.com/*']});
    await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
    await cdp('Page.navigate',{url:base});await ready();
    try { console.log(await evaluate(fs.readFileSync(path.join(root,'tests/handover-reuse-browser.js'),'utf8'))); }
    catch(error) { console.error(await evaluate("document.querySelector('#import-preview').textContent")); throw error; }
    await evaluate('navigator.serviceWorker.ready.then(()=>true)');
    await cdp('Page.reload',{});await pause(500);await ready();
    console.log(await evaluate(`(async()=>{
      const {state}=await import('./js/state.js');
      for(let i=0;i<100&&!state.ready;i++)await new Promise(r=>setTimeout(r,30));
      const expected=JSON.parse(sessionStorage.getItem('reuseExpected'));
      if(JSON.stringify(state.session)!==JSON.stringify(expected.session))throw Error('Reload lost reused session');
      const {Database}=await import('./js/database.js');const db=await Database.open();
      for(const name of ['records','imports','masters'])if(JSON.stringify(await db.all(name))!==JSON.stringify(expected[name]))throw Error('Reload changed reused '+name);
      document.querySelector('#checker-form').elements.checker.value='REUSE CURRENT CHECKER';
      document.querySelector('#checker-form').requestSubmit();
      for(let i=0;i<100&&state.session.checker!=='REUSE CURRENT CHECKER';i++)await new Promise(r=>setTimeout(r,30));
      if((await db.get('settings','session')).value.checker!=='REUSE CURRENT CHECKER')throw Error('Reused session checker not durable');
      await db.restore(JSON.parse(sessionStorage.getItem('reuseBaseline')),'replace');db.db.close();
      sessionStorage.removeItem('reuseExpected');sessionStorage.removeItem('reuseBaseline');
      return 'PASS actual browser reload preserves reused session/history; manual checker saved';
    })()`));
    await cdp('Page.reload',{});await pause(500);await ready();
    const suite=fs.readFileSync(path.join(root,'tests/browser-suite.js'),'utf8');
    let result;
    try { result=await evaluate(suite); }
    catch(error) { console.error(await evaluate("JSON.stringify({toast:document.querySelector('#toast')?.textContent,confirm:document.querySelector('#confirm-dialog')?.textContent,preview:document.querySelector('#import-preview')?.textContent})"));throw error; }
    for(const line of result)console.log(line);
    // Real Chromium editing pipeline (not dispatchEvent-only input assertions).
    await evaluate(`(async()=>{const {state}=await import('./js/state.js');window.nativeDraft=structuredClone(state.draft);const {ensureDraft}=await import('./js/operational-ui.js');ensureDraft(true);location.hash='operasional';document.querySelector('#entry-form [name=time]').focus();})()`);
    for (const digit of '072035') await cdp('Input.insertText',{text:digit});
    console.log(await evaluate(`(async()=>{const {state}=await import('./js/state.js');const t=document.querySelector('#entry-form [name=time]');if(t.value!=='072035'||state.draft.timeMode!=='manual')throw Error('Native first-digit replacement: '+t.value);t.blur();if(t.value!=='07.20.35')throw Error('Native blur format');return 'PASS native Chromium first-digit replacement and incremental numeric typing';})()`));
    await evaluate(`(()=>{const t=document.querySelector('#entry-form [name=time]');t.focus();t.setSelectionRange(3,5);})()`);
    await cdp('Input.insertText',{text:'25'});
    await cdp('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    console.log(await evaluate(`(()=>{const t=document.querySelector('#entry-form [name=time]');if(t.value!=='07.2.35'||t.selectionStart!==4)throw Error('Native middle edit/backspace: '+t.value);return 'PASS native Chromium cursor editing and Backspace without reformatting';})()`));
    await evaluate(`(()=>{const t=document.querySelector('#entry-form [name=time]');t.select();})()`);
    // Bulk insertion exercises numeric replacement without OS clipboard access.
    await cdp('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await cdp('Input.insertText',{text:'720'});
    console.log(await evaluate(`(async()=>{const {state}=await import('./js/state.js');const {flushDraft}=await import('./js/operational-ui.js');const t=document.querySelector('#entry-form [name=time]');if(t.value!=='720')throw Error('Bulk numeric insertion failed');t.blur();await flushDraft();if(t.value!=='07.20'||state.draft.values.time!=='07.20')throw Error('Bulk format failed');return 'PASS native clear-to-AUTO and bulk numeric replacement';})()`));
    await evaluate(`(async()=>{const {state}=await import('./js/state.js');const {Database}=await import('./js/database.js');const {fillDraft}=await import('./js/operational-ui.js');state.draft=window.nativeDraft;delete window.nativeDraft;const db=await Database.open();await db.saveDraft(state.draft);db.db.close();fillDraft();})()`);
    const clockSuite=fs.readFileSync(path.join(root,'tests/live-clock-browser.js'),'utf8');
    for(let stage=0;stage<3;stage++) {
      console.log(await evaluate(clockSuite));
      await cdp('Page.reload',{});await pause(500);await ready();
    }
    const qa=path.join(root,'private-data','qa');fs.mkdirSync(qa,{recursive:true});
    await evaluate("location.hash='setup'");await pause(200);
    console.log(await evaluate(`(()=>{const cards=[...document.querySelectorAll('#view-setup article')];if(document.documentElement.scrollWidth>360)throw Error('Setup overflow at 360px');for(let i=1;i<cards.length;i++)if(cards[i].getBoundingClientRect().top<cards[i-1].getBoundingClientRect().bottom)throw Error('Setup cards not vertical');return 'PASS Setup vertical order and no horizontal overflow at 360px';})()`));
    const mobileLayout=await cdp('Page.getLayoutMetrics');
    fs.writeFileSync(path.join(qa,'setup-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:360,height:mobileLayout.cssContentSize.height,scale:1}})).data,'base64'));
    await evaluate("location.hash='operasional'");await pause(200);
    await evaluate("document.querySelector('#toast').hidden=true;window.scrollTo(0,0)");
    const operationLayout=await cdp('Page.getLayoutMetrics');
    fs.writeFileSync(path.join(qa,'operasional-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:360,height:operationLayout.cssContentSize.height,scale:1}})).data,'base64'));
    await evaluate("document.querySelector('#history [data-edit]').click()");await pause(100);
    fs.writeFileSync(path.join(qa,'correction-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
    await evaluate("document.querySelector('#cancel-correction').click()");
    await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await cdp('Page.reload',{ignoreCache:true});await pause(800);await ready();
    const offline=await evaluate(`(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const {state}=await import('./js/state.js');for(let i=0;i<100&&!state.ready;i++)await wait(50);
      if(!state.ready)throw Error('Offline app failed to initialize');
      if(navigator.onLine)throw Error('Expected offline mode');
      if(!state.session || !state.records.some(r=>r.dtNo==='SAP_826'))throw Error('Offline data/session lost: '+JSON.stringify({session:state.session,records:state.records.map(r=>r.dtNo)}));
      const reordered=state.records.find(r=>r.dtNo==='SAP_826');
      if(reordered?.time!=='08.01' || reordered.ritaseNumber!==3)throw Error('Reload lost correction/number');
      const {Database}=await import('./js/database.js');const checkDb=await Database.open();
      if(!(await checkDb.all('audit')).some(a=>a.action==='renumber'))throw Error('Reload lost numbering audit');checkDb.db.close();
      if(document.querySelector('[name=time]').value!=='07.17')throw Error('Manual draft time lost on offline reload');
      return 'PASS offline app shell, IndexedDB session, records, and edited draft after reload';
    })()`);console.log(offline);
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate("location.hash='setup'");await pause(200);
    console.log(await evaluate(`(()=>{const cards=[...document.querySelectorAll('#view-setup article')];if(document.documentElement.scrollWidth>1280)throw Error('Setup overflow desktop');for(let i=1;i<cards.length;i++)if(cards[i].getBoundingClientRect().top<cards[i-1].getBoundingClientRect().bottom)throw Error('Setup not vertical desktop');return 'PASS Setup vertical order and no horizontal overflow at 1280px';})()`));
    const desktopLayout=await cdp('Page.getLayoutMetrics');
    fs.writeFileSync(path.join(qa,'setup-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:desktopLayout.cssContentSize.height,scale:1}})).data,'base64'));
    // Switch the same origin from production to dev: the dev worker must replace
    // cache-first behavior while preserving the existing database and draft.
    const localPort=server.address().port;
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    server=createServer({root,development:true});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(localPort,'127.0.0.1',resolve);});
    console.log(await evaluate(`(async()=>{
      const oldWorker=navigator.serviceWorker.controller;
      const registration=await navigator.serviceWorker.getRegistration();
      await registration.update();
      for(let i=0;i<200&&navigator.serviceWorker.controller===oldWorker;i++)await new Promise(r=>setTimeout(r,50));
      if(navigator.serviceWorker.controller===oldWorker)throw Error('Dev worker did not replace cache-first worker');
      if(!(await (await fetch('./sw.js')).text()).includes('Development uses the network'))throw Error('Not using dev worker');
      const {Database}=await import('./js/database.js');
      const db=await Database.open();
      try {
        if(!(await db.all('records')).some(r=>r.dtNo==='SAP_826'))throw Error('Dev transition lost records');
        if((await db.get('settings','draft')).value.values.time!=='07.17')throw Error('Dev transition lost draft');
      } finally {db.db.close();}
      return 'PASS production-to-dev worker transition preserves IndexedDB records and manual draft';
    })()`));
    await evaluate("location.hash='setup';document.querySelector('#new-session').click()");
    await pause(200);
    await evaluate("if(!document.querySelector('#confirm-dialog').open)throw Error('Reset dialog missing');document.querySelector('#confirm-ok').click()");
    await pause(300);
    await cdp('Page.reload',{ignoreCache:true});await pause(500);await ready();
    console.log(await evaluate(`(async()=>{
      const {state}=await import('./js/state.js');
      for(let i=0;i<100&&!state.ready;i++)await new Promise(r=>setTimeout(r,30));
      if(!state.ready || state.session || state.draft)throw Error('Reload reactivated ended session/draft');
      if(state.records.some(r=>r.dtNo==='SAP_826'))throw Error('Session reset retained deleted history');
      return 'PASS browser reload after full session reset removes active history without reactivating session or draft';
    })()`));
    if(errors.length)throw Error('Unhandled browser exceptions: '+errors.join('\n'));
    console.log('PASS local Chromium UI at 360px and 1280px; no live Google requests permitted');
    console.log('Screenshots: private-data/qa/ (ignored local artifacts)');
  } finally {
    if(ws?.readyState===WebSocket.OPEN){try{await cdp('Browser.close');}catch{}ws.close();}
    chrome?.kill();server?.close();server?.closeAllConnections();
    await pause(400);
    const safeTmp=path.resolve(os.tmpdir())+path.sep;
    if(path.resolve(profile).startsWith(safeTmp) && path.basename(profile).startsWith('rkef-browser-test-'))try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  }
})().catch(e=>{console.error('FAIL',e);process.exitCode=1;});
