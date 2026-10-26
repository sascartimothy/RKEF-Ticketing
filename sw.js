/* Only same-origin, explicitly enumerated app shell assets. Sheets is never cached here. */
const VERSION = 'rkef-shell-v1.1.2-stock-popup';
const BASE = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './js/checkers.js', './js/checker-ui.js', './js/app.js', './js/database.js', './js/time-date.js', './js/validation.js', './js/state.js',
  './js/stock-ui.js', './js/master-data.js', './js/wa-parser.js', './js/wa-exporter.js', './js/apps-script-api.js',
  './js/ui-components.js', './js/navigation.js', './js/setup-ui.js', './js/operational-ui.js',
  './js/import-ui.js', './js/destinations-ui.js', './js/report-ui.js'].map(p => new URL(p, BASE).href);
const ALLOWED = new Set(ASSETS);
self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS))); });
// No automatic skipWaiting/reload: an open draft must survive an app update.
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rkef-shell-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (event.request.mode === 'navigate' && [BASE.pathname, new URL('index.html', BASE).pathname].includes(url.pathname)) {
    event.respondWith(caches.open(VERSION).then(cache => cache.match(new URL('index.html', BASE).href)).then(response => response || fetch(event.request)));
  } else if (ALLOWED.has(url.href)) event.respondWith(caches.open(VERSION).then(cache => cache.match(event.request)).then(response => response || fetch(event.request)));
});
