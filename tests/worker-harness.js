import fs from 'node:fs';
import vm from 'node:vm';
import '../js/build-identity.js';

export async function workerHarness() {
  const base = 'https://example.test/RKEF-Ticketing/';
  const events = new Map(), stores = new Map();
  let clients = [], claimed = false, skipped = false, broken = false;
  const fetcher = async url => {
    const path = new URL(url).pathname.slice('/RKEF-Ticketing/'.length) || 'index.html';
    const body = fs.readFileSync(new URL('../' + path, import.meta.url));
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.png') ? 'image/png' : 'text/html';
    return new Response(broken && path === 'styles.css' ? 'broken release' : body, {headers:{'Content-Type':type}});
  };
  const snapshot = await RKEFBuild.snapshot(base, fetcher);
  const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const context = {
    URL, Response, AbortController, setTimeout, clearTimeout, fetch:fetcher, RKEFBuild,
    importScripts:() => {},
    self:{location:{href:base + 'sw.js?build=' + snapshot.id}, addEventListener:(name, handler) => events.set(name, handler),
      skipWaiting:async () => { skipped = true; },
      clients:{matchAll:async () => clients, claim:async () => { claimed = true; }}},
    caches:{keys:async () => [...stores.keys()], delete:async key => stores.delete(key), open:async key => {
      if (!stores.has(key)) stores.set(key, new Map());
      const map = stores.get(key);
      return {match:async url => map.get(String(url))?.clone(), put:async (url, response) => map.set(String(url), response.clone())};
    }}
  };
  vm.runInNewContext(worker, context);
  const run = async (event, data = {}) => {
    let pending;
    events.get(event)({...data, waitUntil:promise => { pending = promise; }});
    await pending;
  };
  const message = async (type, data = {}) => {
    let result;
    await run('message', {data:{type,...data}, source:{id:'current'}, ports:[{postMessage:value => { result = value; }}]});
    return result;
  };
  return {base, id:snapshot.id, cacheName:'rkef-shell-v1.1.2-' + snapshot.id, stores, run, message, events,
    setClients:value => { clients = value; }, breakRelease:() => { broken = true; }, claimed:() => claimed, skipped:() => skipped};
}
