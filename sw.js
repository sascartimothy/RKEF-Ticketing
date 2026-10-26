/* Same-origin, allowlisted shell snapshots. Never reads or modifies IndexedDB. */
importScripts('./js/build-identity.js');
const PREFIX = 'rkef-shell-v1.1.2-';
const BASE = new URL('./', self.location.href);
const ID = new URL(self.location.href).searchParams.get('build');
const VERSION = PREFIX + ID;
const ASSETS = ['./', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './assets/RKEF_Ticketing_logo_transparent.png',
  './assets/icon-192.png?v=logo-r-1', './assets/icon-512.png?v=logo-r-1', './assets/icon-maskable-512.png?v=logo-r-1',
  './js/build-identity.js', './js/app-update.js', './js/checkers.js', './js/checker-ui.js', './js/app.js', './js/database.js', './js/time-date.js', './js/validation.js', './js/state.js',
  './js/product-ui.js', './js/stock-ui.js', './js/master-data.js', './js/wa-parser.js', './js/wa-exporter.js', './js/apps-script-api.js',
  './js/ui-components.js', './js/navigation.js', './js/setup-ui.js', './js/operational-ui.js',
  './js/import-ui.js', './js/destinations-ui.js', './js/report-ui.js'].map(p => new URL(p, BASE).href);
const ALLOWED = new Set(ASSETS);
const INFO = new URL('__rkef_snapshot__', BASE).href;
async function ready() {
  if (!RKEFBuild.validID(ID) || !(await caches.keys()).includes(VERSION)) return false;
  const cache = await caches.open(VERSION);
  const marker = await cache.match(INFO);
  if (!marker || (await marker.json()).id !== ID) return false;
  return (await Promise.all([...ASSETS, new URL('sw.js', BASE).href].map(url => cache.match(url)))).every(Boolean);
}
async function cleanup() {
  // Never remove another origin cache or a snapshot still needed by another window.
  const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  if (clients.some(client => client.url.startsWith(BASE.href)) && clients.filter(client => client.url.startsWith(BASE.href)).length > 1) return;
  for (const key of await caches.keys()) if (key.startsWith('rkef-shell-') && key !== VERSION) await caches.delete(key);
}
self.addEventListener('install', event => event.waitUntil((async () => {
  if (!RKEFBuild.validID(ID)) throw Error('A content build ID is required.');
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 45000);
  try {
    const snapshot = await RKEFBuild.snapshot(BASE, fetch, abort.signal);
    if (snapshot.id !== ID) throw Error('Published assets changed during update. Retry after publication completes.');
    const cache = await caches.open(VERSION);
    // Write completion marker last; a failed install cannot be reported ready.
    for (const [path, response] of snapshot.entries) await cache.put(new URL(path, BASE), response);
    await cache.put(INFO, new Response(JSON.stringify({id:ID}), {headers:{'Content-Type':'application/json'}}));
  } catch (error) {
    // Keep every prior shell. Only this incomplete candidate belongs to this install.
    if (!(await ready())) await caches.delete(VERSION);
    throw error;
  } finally { clearTimeout(timer); }
})()));
// Only an explicit, single-client ACTIVATE_BUILD request can skip the waiting phase.
self.addEventListener('message', event => event.waitUntil((async () => {
  const reply = value => event.ports[0]?.postMessage(value);
  if (event.data?.type === 'BUILD_INFO') { reply({id:ID, ready:await ready()}); return; }
  if (event.data?.type !== 'ACTIVATE_BUILD') return;
  if (event.data.target !== ID || !await ready()) { reply({ok:false}); return; }
  const clients = (await self.clients.matchAll({type:'window', includeUncontrolled:true})).filter(client => client.url.startsWith(BASE.href));
  if (clients.some(client => client.id !== event.source?.id)) { reply({blocked:true}); return; }
  reply({ok:true});
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  if (!await ready()) throw Error('Incomplete shell cannot activate.');
  await cleanup();
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Build checks always reach the network, never the offline snapshot (including offline errors).
  if (event.request.headers.get('X-RKEF-Build-Check') === '1') { event.respondWith(fetch(event.request)); return; }
  if (event.request.mode === 'navigate' && [BASE.pathname, new URL('index.html', BASE).pathname].includes(url.pathname)) {
    event.respondWith(caches.open(VERSION).then(cache => cache.match(new URL('index.html', BASE).href)).then(response => response || fetch(event.request)));
  } else if (ALLOWED.has(url.href)) event.respondWith(caches.open(VERSION).then(cache => cache.match(event.request)).then(response => response || fetch(event.request)));
});
