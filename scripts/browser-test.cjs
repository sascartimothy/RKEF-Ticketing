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
  for(let i=0;i<120;i++) { try { if(await evaluate("document.readyState==='complete' && !!document.querySelector('#session-state')")) return; } catch{} await pause(100); }
  throw Error('Page not ready');
}
(async()=>{
  try {
    // Own a fresh production-output server on a free port. Never reuse dev/stale output.
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
        cdp(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId}:{requestId,errorReason:'BlockedByClient'}).catch(error=>errors.push(error.message));
      }
    };
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    await cdp('Network.setBlockedURLs',{urls:['https://*','http://script.google.com/*']});
    await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
    await cdp('Page.navigate',{url:base});await ready();
    const suite=fs.readFileSync(path.join(root,'tests/browser-suite.js'),'utf8');
    let result;
    try { result=await evaluate(suite); }
    catch(error) { console.error(await evaluate("JSON.stringify({toast:document.querySelector('#toast')?.textContent,confirm:document.querySelector('#confirm-dialog')?.textContent,preview:document.querySelector('#import-preview')?.textContent})"));throw error; }
    for(const line of result)console.log(line);
    const qa=path.join(root,'private-data','qa');fs.mkdirSync(qa,{recursive:true});
    await evaluate("location.hash='operasional'");await pause(200);
    fs.writeFileSync(path.join(qa,'operasional-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
    await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await cdp('Page.reload',{ignoreCache:true});await pause(800);await ready();
    const offline=await evaluate(`(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const {state}=await import('./js/state.js');for(let i=0;i<100&&!state.ready;i++)await wait(50);
      if(!state.ready)throw Error('Offline app failed to initialize');
      if(navigator.onLine)throw Error('Expected offline mode');
      if(!state.session || !state.records.some(r=>r.dtNo==='TEST_DT'))throw Error('Offline data/session lost');
      if(document.querySelector('[name=time]').value!=='07.17')throw Error('Manual draft time lost on offline reload');
      return 'PASS offline app shell, IndexedDB session, records, and edited draft after reload';
    })()`);console.log(offline);
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate("location.hash='setup'");await pause(200);
    fs.writeFileSync(path.join(qa,'setup-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
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
        if(!(await db.all('records')).some(r=>r.dtNo==='TEST_DT'))throw Error('Dev transition lost records');
        if((await db.get('settings','draft')).value.values.time!=='07.17')throw Error('Dev transition lost draft');
      } finally {db.db.close();}
      return 'PASS production-to-dev worker transition preserves IndexedDB records and manual draft';
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
