import { initAppUpdate } from './app-update.js';
import { renderCheckers } from './checker-ui.js';
import { Database, validateBackup } from './database.js';
import { DestinationBridge } from './apps-script-api.js';
import { state } from './state.js';
import { $, $$, toast } from './ui-components.js';
import { initNavigation } from './navigation.js';
import { initSetup, renderSetup } from './setup-ui.js';
import { initDestinations, renderDestinations, syncDestinations } from './destinations-ui.js';
import { initImport } from './import-ui.js';
import { initOperational, renderOperational, ensureDraft, fillDraft, flushDraft, finishSessionEnd } from './operational-ui.js';
import { initReport, renderReport } from './report-ui.js';
let db, channel, refreshQueue = Promise.resolve();
function fail(error) { console.error(error); toast(error?.message || 'Operasi gagal. Data belum dikonfirmasi tersimpan.', true); }
function fatal(error) {
  state.ready = false;
  $('#main').inert = false; $('#main').removeAttribute('aria-busy');
  $('#storage-error').textContent = 'Penyimpanan belum siap: ' + error.message + ' Input dinonaktifkan untuk mencegah sukses palsu. Muat ulang setelah masalah diperbaiki. Data yang ada tidak dihapus.';
  $('#storage-error').hidden = false;
  for (const el of $$('main button, main input, main select, main textarea')) el.disabled = true;
}
function network() {
  $('#network').textContent = navigator.onLine ? 'Online' : 'Offline';
  $('#network').classList.toggle('offline', !navigator.onLine);
  if (state.ready) { renderDestinations(); renderCheckers(); }
}
async function load({ restoreDraft = false, fillSession = false } = {}) {
  const snapshot = await db.snapshot();
  validateBackup({ application: 'RKEF_TICKETING', version: 1, stores: snapshot });
  const generation = snapshot.settings.find(s => s.id === 'resetGeneration')?.value || null;
  if (state.storageGeneration !== undefined && state.storageGeneration !== generation && db.generation !== generation) {
    finishSessionEnd(true);
    $('#wa-source').value = '';
    $('#import-preview').hidden = true;
    location.hash = 'setup';
  }
  state.storageGeneration = generation;
  state.records = snapshot.records; state.masters = snapshot.masters;
  state.lastHandover = snapshot.settings.find(s => s.id === 'lastHandover')?.value || null;
  state.session = snapshot.settings.find(s => s.id === 'session')?.value || null;
  state.checkerPending = snapshot.pending.find(p => p.id === 'checker') || null;
  state.checkerCache = snapshot.cache.find(c => c.id === 'checkers') || null;
  state.cache = snapshot.cache.find(c => c.id === 'destinations') || null;
  state.pending = snapshot.pending.find(p => p.id === 'destination') || null;
  if (restoreDraft) state.draft = snapshot.settings.find(s => s.id === 'draft')?.value || null;
  if (state.draft && (!state.session || ['activationId', 'handoverId', 'operationDate', 'shift', 'scale'].some(k => state.draft.session?.[k] !== state.session[k]))) {
    state.draft = null;
    fillDraft();
  }
  if (state.draft && state.session) state.draft.session = structuredClone(state.session);
  if (state.view === 'operasional' && !state.draft) ensureDraft();
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
    $('#storage-info').textContent = `${persisted ? 'Penyimpanan persisten diizinkan.' : 'Penyimpanan dapat dibersihkan browser. Pemulihan metadata lengkap tidak tersedia melalui UI.'}${estimate?.usage ? ' Terpakai ' + (estimate.usage / 1048576).toFixed(1) + ' MB.' : ''}`;
  } catch { $('#storage-info').textContent = 'Informasi kapasitas tidak tersedia. Data tetap lokal di perangkat.'; }
}
async function pwa() {
  initAppUpdate();
  if (!('serviceWorker' in navigator)) { $('#pwa-state').textContent = 'Service worker tidak tersedia di browser ini.'; return; }
  const report = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    $('#pwa-state').textContent = registration?.active ? 'App shell offline siap pada perangkat ini.' : 'App shell offline belum siap; gunakan Update saat online untuk menyiapkannya.';
  };
  report().catch(() => {}); navigator.serviceWorker.addEventListener('controllerchange', () => report().catch(() => {}));
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
    const bridge = new DestinationBridge(window.RKEF_CONFIG?.appsScriptUrl);
    const ctx = { db, bridge, changed, fail, flushDraft, ensureDraft, fillDraft, renderReport };
    initSetup(ctx); initDestinations(ctx); initOperational(ctx); initImport(ctx); initReport(ctx);
    state.ready = true;
    await load({ restoreDraft: true, fillSession: true });
    fillDraft(); if (state.view === 'operasional') ensureDraft(); renderReport();
    $('#main').inert = false; $('#main').removeAttribute('aria-busy');
    $('#persist-storage').onclick = async () => { try { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Penyimpanan persisten diizinkan.' : 'Browser belum memberikan izin persisten. Data tetap lokal di perangkat.'); await storageInfo(); } catch (e) { fail(e); } };
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
