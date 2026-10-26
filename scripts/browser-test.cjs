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
    catch(error) { console.error(await evaluate("JSON.stringify({preview:document.querySelector('#import-preview').textContent,checker:document.querySelector('#checker-error').textContent,feedback:document.querySelector('#checker-feedback').textContent,entry:document.querySelector('#entry-error').textContent,storage:document.querySelector('#storage-error').textContent})")); throw error; }
    // An independently loaded second tab holds its own pre-reset connection.
    const peerTarget=await cdp('Target.createTarget',{url:'about:blank'});
    const peerTargets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const peerSocket=new WebSocket(peerTargets.find(t=>t.id===peerTarget.targetId).webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{peerSocket.onopen=resolve;peerSocket.onerror=reject;});
    let peerSeq=0;const peerPending=new Map();
    const peerCommand=(method,params={})=>new Promise((resolve,reject)=>{const id=++peerSeq;peerPending.set(id,{resolve,reject});peerSocket.send(JSON.stringify({id,method,params}));});
    peerSocket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=peerPending.get(m.id);peerPending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);}};
    const peerEvaluate=async expression=>{const r=await peerCommand('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    try {
      await peerCommand('Network.enable');
      await peerCommand('Network.setBlockedURLs',{urls:['https://*','http://script.google.com/*']});
      await peerCommand('Page.navigate',{url:base});
      for(let i=0;i<100;i++){if(await peerEvaluate("document.readyState==='complete' && !!document.querySelector('#session-state') && !document.querySelector('#main').inert"))break;await pause(50);}
      await peerEvaluate("(async()=>{window.resetPeerDb=await (await import('./js/database.js')).Database.open();document.querySelector('#wa-source').value='OLD WA FROM ANOTHER TAB';})()");
      await evaluate("(async()=>{const {Database}=await import('./js/database.js');const db=await Database.open();await db.endSession(null,null);db.db.close();const c=new BroadcastChannel('rkef-ticketing');c.postMessage('changed');c.close();})()");
      console.log(await peerEvaluate("(async()=>{for(let i=0;i<100&&document.querySelector('#wa-source').value;i++)await new Promise(r=>setTimeout(r,30));if(document.querySelector('#wa-source').value)throw Error('Peer retained stale WA');let blocked=false;try{await resetPeerDb.put('settings',{id:'old-counter',value:999});}catch(e){blocked=e.message.includes('direset');}if(!blocked)throw Error('Second tab resurrected old data');resetPeerDb.db.close();return 'PASS actual second browser tab clears stale WA and rejects writes after reset';})()"));
    } finally {peerSocket.close();await cdp('Target.closeTarget',{targetId:peerTarget.targetId});}
    await evaluate('navigator.serviceWorker.ready.then(()=>true)');
    await cdp('Page.reload',{});await pause(500);await ready();
    console.log(await evaluate(`(async()=>{
      const {state}=await import('./js/state.js');
      for(let i=0;i<100&&!state.ready;i++)await new Promise(r=>setTimeout(r,30));
      const expected=JSON.parse(sessionStorage.getItem('totalResetExpected'));
      const {Database}=await import('./js/database.js');const db=await Database.open();
      if(state.session||state.draft||state.records.length||document.querySelector('#wa-source').value)throw Error('Reload restored operational data');
      if(JSON.stringify(await db.all('cache'))!==JSON.stringify(expected.cache))throw Error('Reload lost shared master caches');
      const el=document.querySelector('#wa-source');el.value=expected.source;el.dispatchEvent(new Event('paste',{bubbles:true}));
      for(let i=0;i<200&&state.sessionTransition;i++)await new Promise(r=>setTimeout(r,30));
      if(state.session?.nextRitase!=='46315-084'||state.records.length!==83||!state.masters.some(m=>m.stockpile==='RESET_STOCK'))throw Error('New WA blocked by pre-reset history or missing mapping');
      if(!document.querySelector('#import-preview').classList.contains('success'))throw Error('New WA not successful');
      await db.restore(JSON.parse(sessionStorage.getItem('reuseBaseline')),'replace');db.db.close();
      sessionStorage.removeItem('totalResetExpected');sessionStorage.removeItem('reuseBaseline');
      return 'PASS actual reload remains empty with shared caches; new 83-row WA creates fresh mapping/session without old OD-06 conflicts';
    })()`));
    await cdp('Page.reload',{});await pause(500);await ready();
    const suite=fs.readFileSync(path.join(root,'tests/browser-suite.js'),'utf8');
    let result;
    try { result=await evaluate(suite); }
    catch(error) { console.error(await evaluate("JSON.stringify({toast:document.querySelector('#toast')?.textContent,confirm:document.querySelector('#confirm-dialog')?.textContent,preview:document.querySelector('#import-preview')?.textContent})"));throw error; }
    for(const line of result)console.log(line);
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/checkers-browser.js'),'utf8')));
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/product-popup-browser.js'),'utf8')));
    await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await cdp('Page.reload',{});await pause(400);await ready();
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/product-popup-browser.js'),'utf8')));
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await cdp('Page.reload',{});await pause(400);await ready();
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/stock-popup-browser.js'),'utf8')));
    await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await cdp('Page.reload',{});await pause(400);await ready();
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/stock-popup-browser.js'),'utf8')));
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await cdp('Page.reload',{});await pause(400);await ready();
    await evaluate(`(async()=>{
      const {Database}=await import('./js/database.js');const db=await Database.open();
      sessionStorage.setItem('checkerPendingBaseline',JSON.stringify(await db.backup()));
      await db.beginCheckerRequest({id:'checker',createdAt:new Date().toISOString(),payload:{action:'addChecker',name:'TEST PENDING RELOAD',expected_version:'a'.repeat(64),request_id:'chk_reload_pending_0123456789'}});
      db.db.close();
    })()`);
    await cdp('Page.reload',{});await pause(400);await ready();
    console.log(await evaluate(`(async()=>{
      const {state}=await import('./js/state.js');const {Database}=await import('./js/database.js');
      if(state.checkerPending?.payload.request_id!=='chk_reload_pending_0123456789')throw Error('Checker pending ID lost on reload');
      location.hash='setup';document.querySelector('#edit-checkers').click();
      if(!document.querySelector('#retry-checker')||!document.querySelector('#add-checker').disabled)throw Error('Pending Checker retry controls missing');
      document.querySelector('#checker-cancel').click();
      const db=await Database.open();await db.restore(JSON.parse(sessionStorage.getItem('checkerPendingBaseline')),'replace');db.db.close();sessionStorage.removeItem('checkerPendingBaseline');
      return 'PASS actual reload preserves unresolved Checker request_id and recovery controls without new automatic mutation';
    })()`));
    await cdp('Page.reload',{});await pause(400);await ready();

    // Real Chromium editing pipeline (not dispatchEvent-only input assertions).
    await evaluate(`(async()=>{const {state}=await import('./js/state.js');window.nativeDraft=structuredClone(state.draft);const {ensureDraft}=await import('./js/operational-ui.js');ensureDraft(true);location.hash='operasional';for(let i=0;i<100&&document.querySelector('#view-operasional').hidden;i++)await new Promise(r=>setTimeout(r,10));document.querySelector('#entry-form [name=time]').focus();})()`);
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
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/report-browser.js'),'utf8')));
    // Report fixtures replace runtime state directly. Reload the restored database
    // so subsequent shell assertions exercise normal boot/rendering, not fixture UI.
    await cdp('Page.reload',{});await pause(400);await ready();
    const mobileShell = fs.readFileSync(path.join(root,'tests/mobile-shell-browser.js'),'utf8');
    const keypadSuite = fs.readFileSync(path.join(root,'tests/dt-keypad-browser.js'),'utf8');
    console.log(await evaluate(keypadSuite));
    // Native editing, physical keyboard button activation and pointer focus transfer.
    await evaluate("document.querySelector('#entry-dt').focus();document.querySelector('#entry-dt').select()");
    await cdp('Input.insertText',{text:'SAP_820'});
    const deletePoint=await evaluate("(()=>{const b=document.querySelector('[data-dt-key=backspace]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...deletePoint,button:'left',clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...deletePoint,button:'left',clickCount:1});
    console.log(await evaluate("if(document.querySelector('#entry-dt').value!=='SAP_82'||document.activeElement===document.querySelector('#entry-dt'))throw Error('Native keypad pointer/delete/focus');'PASS native manual typing and keypad pointer blur/delete without refocusing DT'"));
    await evaluate("document.querySelector('[data-dt-key=\"0\"]').focus()");
    await cdp('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    console.log(await evaluate("(async()=>{const {flushDraft}=await import('./js/operational-ui.js');if(document.querySelector('#entry-dt').value!=='SAP_820')throw Error('Physical keyboard keypad activation');document.querySelector('[data-dt-key=backspace]').click();await flushDraft();return 'PASS physical Space activates one keypad digit and preserves shared draft';})()"));
    await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await cdp('Page.reload',{});await pause(500);await ready();
    console.log(await evaluate(keypadSuite));
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await cdp('Page.reload',{});await pause(400);await ready();
    const checkMobileShell = async () => {
      for (const width of [320,360,375,390,430,768,1280]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:true});
        await pause(100);
        console.log(await evaluate(mobileShell));
        if (await evaluate("(async()=>!!(await import('./js/state.js')).state.session)()")) {
          const shellQa=path.join(root,'private-data','qa');fs.mkdirSync(shellQa,{recursive:true});
          const keyPoints=await evaluate(`(()=>{
            const dt=document.querySelector('#entry-dt'),pad=document.querySelector('#dt-keypad');
            window.keypadLayoutOriginal=dt.value;dt.value='';dt.dispatchEvent(new Event('input',{bubbles:true}));
            pad.scrollIntoView({block:'center'});
            return [...pad.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
              if(document.elementFromPoint(x,y)!==b)throw Error('Keypad key not directly clickable: '+b.dataset.dtKey);
              return {x,y};});
          })()`);
          for (const point of keyPoints) {
            await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
            await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
          }
          console.log(await evaluate(`(async()=>{
            const dt=document.querySelector('#entry-dt'),pad=document.querySelector('#dt-keypad');
            const {state}=await import('./js/state.js'),{flushDraft}=await import('./js/operational-ui.js');
            if(dt.value!=='123456789'||state.draft.values.dtNo!==dt.value||pad.scrollLeft!==0||document.activeElement===dt)throw Error('Native all-key clicks/delete/draft/focus without scroll');
            dt.value=window.keypadLayoutOriginal;delete window.keypadLayoutOriginal;dt.dispatchEvent(new Event('input',{bubbles:true}));await flushDraft();
            const r=pad.querySelector('button').getBoundingClientRect();window.scrollTo(0,0);
            return 'PASS keypad ${width}px: all 11 native pointer clicks without scroll, 1234567890 then delete, shared draft; button '+r.width.toFixed(2)+' x '+r.height+' CSS px';
          })()`));
          await pause(100);
          fs.writeFileSync(path.join(shellQa,`keypad-fit-${width}.png`),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
          for (const mode of ['full','mini']) {
            await evaluate(`window.scrollTo(0,${mode === 'mini' ? 240 : 0});document.querySelector('#toast').hidden=true`);
            await pause(100);
            fs.writeFileSync(path.join(shellQa,`header-${mode}-${width}.png`),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
          }
          await evaluate('window.scrollTo(0,0)');
        }
      }
      await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
      await pause(100);
    };
    await checkMobileShell();
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/operational-layout-browser.js'),'utf8')));
    // Simulate a resized viewport with a focused field; this is not a physical IME test.
    await evaluate("document.querySelector('#entry-form [name=note]').focus()");
    await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:450,deviceScaleFactor:1,mobile:true});await pause(100);
    console.log(await evaluate("if(document.querySelector('#save-entry').checkVisibility())throw Error('Save must hide for keyboard-sized viewport');'PASS simulated keyboard viewport hides fixed save'"));
    await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});await pause(100);
    console.log(await evaluate("if(!document.querySelector('#save-entry').checkVisibility())throw Error('Save did not return after viewport restored');document.activeElement.blur();'PASS fixed save returns after simulated keyboard closes'"));
    const qa=path.join(root,'private-data','qa');fs.mkdirSync(qa,{recursive:true});
    await evaluate("location.hash='report';document.querySelector('#report-preview').open=true;document.querySelector('#toast').hidden=true;window.scrollTo(0,0)");await pause(200);
    console.log(await evaluate("if(document.documentElement.scrollWidth>360)throw Error('Report overflow at 360px');'PASS Report no horizontal overflow at 360px'"));
    const reportLayout=await cdp('Page.getLayoutMetrics');
    fs.writeFileSync(path.join(qa,'report-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:360,height:reportLayout.cssContentSize.height,scale:1}})).data,'base64'));
    await evaluate("location.hash='setup'");await pause(200);
    console.log(await evaluate(`(()=>{const cards=[...document.querySelectorAll('#view-setup article')];if(document.documentElement.scrollWidth>360)throw Error('Setup overflow at 360px');for(let i=1;i<cards.length;i++)if(cards[i].getBoundingClientRect().top<cards[i-1].getBoundingClientRect().bottom)throw Error('Setup cards not vertical');return 'PASS Setup vertical order and no horizontal overflow at 360px';})()`));
    const mobileLayout=await cdp('Page.getLayoutMetrics');
    fs.writeFileSync(path.join(qa,'setup-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:360,height:mobileLayout.cssContentSize.height,scale:1}})).data,'base64'));
    await evaluate("document.querySelector('#choose-checkers').click()");
    await pause(100);
    fs.writeFileSync(path.join(qa,'checker-checklist-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
    await evaluate("document.querySelector('#checker-cancel').click()");await pause(50);
    await evaluate("document.querySelector('#edit-checkers').click()");await pause(100);
    fs.writeFileSync(path.join(qa,'checker-management-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
    await evaluate("document.querySelector('#checker-cancel').click()");await pause(50);
    await evaluate("location.hash='operasional'");await pause(200);
    await evaluate("document.querySelector('#toast').hidden=true;window.scrollTo(0,0)");
    const operationLayout=await cdp('Page.getLayoutMetrics');
    const captureProduct = async width => {
      await evaluate("document.querySelector('#choose-product').click()");
      for (const mode of ['select','add','long-list']) {
        if (mode==='add') await evaluate("document.querySelector('#product-add').click();document.activeElement.blur()");
        if (mode==='long-list') await evaluate("document.querySelector('#product-cancel').click();document.querySelector('#choose-product').click();const body=document.querySelector('#product-body');body.append(...Array.from({length:40},()=>body.querySelector('.master-item').cloneNode(true)))");
        console.log(await evaluate(`(()=>{const d=document.querySelector('#product-dialog'),r=d.getBoundingClientRect(),body=document.querySelector('#product-body');if(!d.open||r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight||body.scrollWidth>body.clientWidth||document.querySelector('#save-entry').checkVisibility())throw Error('Product modal layout overflow');if('${mode}'==='long-list'&&body.scrollHeight<=body.clientHeight)throw Error('Long mapping list must scroll');return 'PASS Product ${mode} popup geometry/scroll/fixed-save hiding at ${width}px';})()`));
        fs.writeFileSync(path.join(qa,`product-${mode}-${width}.png`),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
      }
      await evaluate("document.querySelector('#product-close').click();document.activeElement.blur()");
    };
    const captureStock = async width => {
      await evaluate("document.querySelector('#choose-stock').click()");
      for(const mode of ['select','manage','add','error']) {
        if(mode==='manage')await evaluate("document.querySelector('#stock-manage').click()");
        if(mode==='add')await evaluate("document.querySelector('#stock-add').click();document.activeElement.blur()");
        if(mode==='error')await evaluate("document.querySelector('#stock-form').elements.stockpile.value='SS-14';document.querySelector('#stock-form').elements.pileId.value='S14_';document.querySelector('#stock-ok').click()");
        console.log(await evaluate(`(()=>{const d=document.querySelector('#stock-dialog'),r=d.getBoundingClientRect();if(!d.open||r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight||document.querySelector('#stock-body').scrollWidth>document.querySelector('#stock-body').clientWidth||document.querySelector('#save-entry').checkVisibility())throw Error('Stock modal layout overflow');return 'PASS stock ${mode} modal geometry and fixed-save hiding at ${width}px';})()`));
        fs.writeFileSync(path.join(qa,`stock-${mode}-${width}.png`),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
      }
      await evaluate("document.querySelector('#stock-cancel').click();document.querySelector('#stock-back').click();document.querySelector('#stock-close').click();document.activeElement.blur()");
    };
    await captureStock(360);
    await captureProduct(360);
    fs.writeFileSync(path.join(qa,'operasional-viewport-360.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
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
      const {sessionReport}=await import('./js/wa-exporter.js');const report=sessionReport(state.records,state.session);
      if(report.error || !report.total || report.text!==document.querySelector('#report-output').value || Number(document.querySelector('#report-count').textContent)!==report.total)throw Error('Offline reload Report inconsistent: '+report.error);
      return 'PASS offline app shell, IndexedDB session, records, Report totals/WA, and edited draft after reload';
    })()`);console.log(offline);
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    console.log(await evaluate(fs.readFileSync(path.join(root,'tests/operational-layout-browser.js'),'utf8')));
    await captureStock(1280);
    await captureProduct(1280);
    fs.writeFileSync(path.join(qa,'operasional-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
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
      if(document.querySelector('#report-output').value || !document.querySelector('#copy-report').disabled || !document.querySelector('#report-sections').hidden)throw Error('Reset retained active Report');
      return 'PASS browser reload after full session reset removes active history without reactivating session or draft';
    })()`));
    await checkMobileShell();
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
