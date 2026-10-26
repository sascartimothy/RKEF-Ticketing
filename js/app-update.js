import './build-identity.js';
import { $ } from './ui-components.js';

const BASE = new URL('../', import.meta.url);
const TARGET = 'rkef-update-target';
const messages = {
  checking:'Memeriksa pembaruan aplikasi...', current:'Aplikasi sudah menggunakan versi terbaru.',
  available:'Pembaruan aplikasi tersedia. Klik Update untuk memasang.',
  offline:'Tidak ada internet. Pemeriksaan pembaruan belum tersedia.',
  error:'Pemeriksaan pembaruan gagal. Silakan coba kembali.',
  updating:'Memperbarui aplikasi...', ready:'Pembaruan siap. Memuat ulang aplikasi...',
  failed:'Pembaruan belum berhasil. Aplikasi lama tetap dapat digunakan.',
  blocked:'Tutup tab atau jendela RKEF Ticketing lainnya, lalu tekan Update kembali.',
  unsupported:'Service Worker tidak tersedia. Pembaruan aman belum didukung browser ini.',
  development:'Mode development memakai jaringan. Verifikasi update PWA melalui preview.',
  unverified:'Build halaman belum dapat diverifikasi. Tutup lalu buka kembali aplikasi.'
};
export function workerRequest(worker, type, data = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(Error('Worker belum tersedia.'));
    const channel = new MessageChannel();
    const finish = (fn, value) => { clearTimeout(timer); channel.port1.close(); fn(value); };
    const timer = setTimeout(() => finish(reject, Error('Worker tidak merespons.')), timeout);
    channel.port1.onmessage = e => finish(resolve, e.data);
    worker.postMessage({type,...data}, [channel.port2]);
  });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function initAppUpdate() {
  const button = $('#update-app'), output = $('#update-state'), buildInfo = $('#build-info');
  const dialog = $('#update-dialog');
  let registration, localID, target, checking, busy = false, lastCheck = 0, reloaded = false;
  // Capture the controller responsible for this document, before any lifecycle changes.
  const pageController = navigator.serviceWorker?.controller;
  const status = (key, detail = '') => {
    output.dataset.state = key; output.textContent = messages[key] + (detail ? ' ' + detail : '');
    output.className = 'alert ' + (key === 'current' ? 'success' : ['available','blocked'].includes(key) ? 'warning' : ['failed','error'].includes(key) ? 'danger' : '');
    output.setAttribute('aria-busy', String(['checking','updating'].includes(key)));
  };
  async function check() {
    if (checking) return checking;
    checking = (async () => {
      lastCheck = Date.now();
      if (!navigator.onLine) { status('offline'); return false; }
      status('checking');
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 30000);
      try {
        const remote = await RKEFBuild.snapshot(BASE, fetch, abort.signal);
        target = remote.id;
        if (!localID) { status('unverified'); return true; }
        status(localID === target ? 'current' : 'available');
        buildInfo.textContent = `Build aktif: ${localID} · Server: ${target}`;
        return localID !== target;
      } catch (error) {
        target = null;
        status(!navigator.onLine ? 'offline' : /Inventori/.test(error.message) && !pageController ? 'development' : 'error');
        return false;
      } finally { clearTimeout(timer); }
    })();
    try { return await checking; } finally { checking = null; }
  }
  function confirm() {
    if (document.querySelector('dialog[open]')) return Promise.resolve(false);
    return new Promise(resolve => {
      dialog.returnValue = 'cancel';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), {once:true});
      dialog.showModal(); $('#update-cancel').focus();
    });
  }
  async function install() {
    status('updating');
    // Distinct script URL makes asset-only changes installable without a generated manifest.
    registration = await navigator.serviceWorker.register(new URL(`sw.js?build=${target}`, BASE), {scope:BASE.pathname, updateViaCache:'none'});
    const candidate = registration.installing;
    await registration.update();
    let worker;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (candidate?.state === 'redundant') throw Error('Pemasangan aset gagal.');
      worker = registration.waiting || registration.active;
      if (worker && !registration.installing) {
        const info = await workerRequest(worker, 'BUILD_INFO');
        if (info.id === target && info.ready) break;
      }
      worker = null; await sleep(150);
    }
    if (!worker) throw Error('Build target belum siap.');
    const result = await workerRequest(worker, 'ACTIVATE_BUILD', {target});
    if (result.blocked) { status('blocked'); return; }
    if (!result.ok) throw Error('Aktivasi ditolak.');
    sessionStorage.setItem(TARGET, target);
    // controllerchange alone is insufficient; verify the controller snapshot and its cache.
    while (Date.now() < deadline) {
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        const info = await workerRequest(controller, 'BUILD_INFO');
        if (info.id === target && info.ready) {
          if (!reloaded) { reloaded = true; status('ready'); location.reload(); }
          return;
        }
      }
      await sleep(150);
    }
    throw Error('Controller target belum aktif.');
  }
  button.onclick = async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    try {
      if (!('serviceWorker' in navigator)) { status('unsupported'); return; }
      if (await check() && await confirm()) await install();
    } catch { status('failed'); }
    finally { busy = false; button.disabled = false; }
  };
  const backgroundCheck = () => { if (!busy && Date.now() - lastCheck > 300000) void check(); };
  window.addEventListener('online', backgroundCheck);
  window.addEventListener('offline', () => { if (!busy) status('offline'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) backgroundCheck(); });
  if (!('serviceWorker' in navigator)) { status('unsupported'); return; }
  (async () => {
    try {
      if (pageController) {
        try {
          const info = await workerRequest(pageController, 'BUILD_INFO');
          if (info.ready && RKEFBuild.validID(info.id)) localID = info.id;
        } catch { /* Legacy worker: do not invent an identity for this document. */ }
      }
      registration = await navigator.serviceWorker.getRegistration(BASE);
      const expected = sessionStorage.getItem(TARGET);
      if (expected) {
        sessionStorage.removeItem(TARGET);
        if (expected !== localID) { status('failed'); return; }
      }
      if (localID) buildInfo.textContent = 'Build aktif: ' + localID;
      await check();
      // Initial installation needs no session interruption and never reloads the document.
      if (!registration && target) registration = await navigator.serviceWorker.register(new URL(`sw.js?build=${target}`, BASE), {scope:BASE.pathname, updateViaCache:'none'});
    } catch { status('error'); }
  })();
}
