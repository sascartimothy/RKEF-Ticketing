import { Database, validateBackup } from './database.js';
import { DestinationBridge } from './apps-script-api.js';
import { state } from './state.js';
import { $, $$, toast } from './ui-components.js';
import { initNavigation } from './navigation.js';
import { initSetup, renderSetup } from './setup-ui.js';
import { initDestinations, renderDestinations, syncDestinations } from './destinations-ui.js';
import { initImport } from './import-ui.js';
import { initOperational, renderOperational, ensureDraft, fillDraft, flushDraft } from './operational-ui.js';
import { initReport, renderReport, applySessionFilter } from './report-ui.js';
let db, channel, refreshQueue = Promise.resolve();
function fail(error) { console.error(error); toast(error?.message || 'Operasi gagal. Data belum dikonfirmasi tersimpan.', true); }
function fatal(error) {
  state.ready = false;
  $('#main').inert = false; $('#main').removeAttribute('aria-busy');
  $('#storage-error').textContent = 'Penyimpanan belum siap: ' + error.message + ' Input dinonaktifkan untuk mencegah sukses palsu. Muat ulang setelah masalah diperbaiki. Data yang ada tidak dihapus.';
  $('#storage-error').hidden = false;
  for (const el of $$('main button, main input, main select, main textarea')) el.disabled = true;
  // A raw export remains available if the database opened but validation failed.
  if (db) { $('#backup').disabled = false; $('#backup').onclick = async () => {
    try { const { download } = await import('./ui-components.js'); download('RKEF-recovery.json', JSON.stringify(await db.backup(), null, 2), 'application/json'); } catch (e) { fail(e); }
  }; }
}
function network() {
  $('#network').textContent = navigator.onLine ? 'Online' : 'Offline';
  $('#network').classList.toggle('offline', !navigator.onLine);
  if (state.ready) renderDestinations();
}
async function load({ restoreDraft = false, fillSession = false } = {}) {
  const snapshot = await db.snapshot();
  validateBackup({ application: 'RKEF_TICKETING', version: 1, stores: snapshot });
  state.records = snapshot.records; state.masters = snapshot.masters;
  state.session = snapshot.settings.find(s => s.id === 'session')?.value || null;
  state.cache = snapshot.cache.find(c => c.id === 'destinations') || null;
  state.pending = snapshot.pending.find(p => p.id === 'destination') || null;
  if (restoreDraft) state.draft = snapshot.settings.find(s => s.id === 'draft')?.value || null;
  renderSetup({ fillSession }); renderDestinations(); renderOperational(); renderReport();
}
async function changed(options = {}) {
  refreshQueue = refreshQueue.catch(() => {}).then(() => load(options));
  await refreshQueue;
  channel?.postMessage('changed');
}
async function storageInfo() {
  try {
    const persisted = await navigator.storage?.persisted?.();
    const estimate = await navigator.storage?.estimate?.();
    $('#storage-info').textContent = `${persisted ? 'Penyimpanan persisten diizinkan.' : 'Penyimpanan dapat dibersihkan browser. Backup tetap diperlukan.'}${estimate?.usage ? ' Terpakai ' + (estimate.usage / 1048576).toFixed(1) + ' MB.' : ''}`;
  } catch { $('#storage-info').textContent = 'Informasi kapasitas tidak tersedia. Tetap lakukan backup.'; }
}
async function pwa() {
  if (!('serviceWorker' in navigator)) { $('#pwa-state').textContent = 'Service worker tidak tersedia di browser ini.'; return; }
  try {
    const registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname });
    const report = () => { $('#pwa-state').textContent = registration.active ? 'App shell offline siap pada perangkat ini.' : 'Menyiapkan app shell offline…'; };
    report(); navigator.serviceWorker.addEventListener('controllerchange', report);
    registration.addEventListener('updatefound', () => { registration.installing?.addEventListener('statechange', report); });
  } catch (e) { $('#pwa-state').textContent = 'App shell offline belum siap: ' + e.message; }
  let prompt;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; $('#install').hidden = false; });
  $('#install').onclick = async () => { if (prompt) { await prompt.prompt(); await prompt.userChoice; prompt = null; $('#install').hidden = true; } };
  window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('Aplikasi terpasang.'); });
}
async function boot() {
  network(); window.addEventListener('offline', network); window.addEventListener('online', () => { network(); if (state.ready) syncDestinations(); });
  initNavigation(view => { state.view = view; if (state.ready) { if (view === 'operasional') ensureDraft(); if (view === 'report') renderReport(); } });
  try {
    db = await Database.open();
    if (!await db.get('settings', 'initialized')) {
      await db.transaction(['settings', 'masters'], 'readwrite', s => {
        s.masters.put({ id: 'default-day', kind: 'shift', value: 'Day', active: true, origin: 'local' });
        s.masters.put({ id: 'default-night', kind: 'shift', value: 'Night', active: true, origin: 'local' });
        s.settings.put({ id: 'initialized', value: true });
      });
    }
    const bridge = new DestinationBridge(window.RKEF_CONFIG?.appsScriptUrl);
    const ctx = { db, bridge, changed, fail, flushDraft, ensureDraft, fillDraft, applySessionFilter };
    initSetup(ctx); initDestinations(ctx); initOperational(ctx); initImport(ctx); initReport(ctx);
    state.ready = true;
    await load({ restoreDraft: true, fillSession: true });
    fillDraft(); if (state.view === 'operasional') ensureDraft(); applySessionFilter();
    $('#main').inert = false; $('#main').removeAttribute('aria-busy');
    $('#persist-storage').onclick = async () => { try { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Penyimpanan persisten diizinkan.' : 'Browser belum memberikan izin persisten. Tetap unduh backup.'); await storageInfo(); } catch (e) { fail(e); } };
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('rkef-ticketing');
      channel.onmessage = () => { refreshQueue = refreshQueue.catch(() => {}).then(() => load()).catch(fatal); };
    }
    window.addEventListener('rkef-storage-closed', () => fatal(Error('Versi penyimpanan berubah di tab lain. Muat ulang.')));
    await storageInfo();
    if (navigator.onLine) syncDestinations();
  } catch (error) { fatal(error); }
  pwa();
}
boot();
