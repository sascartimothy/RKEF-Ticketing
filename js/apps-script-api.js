import { destinationName, nameKey } from './validation.js';
export function endpointURL(url) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || '')) throw Error('URL Apps Script /exec tidak valid. Periksa config.js.');
  return url;
}
let counter = 0;
export function jsonp(url, action, timeout = 12000, params = {}) {
  endpointURL(url);
  if (!['health', 'list', 'listCheckers', 'checkerStatus'].includes(action)) throw Error('Action GET tidak diizinkan.');
  return new Promise((resolve, reject) => {
    const cb = '_rkef_' + Date.now() + '_' + (++counter);
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      clearTimeout(timer); script.remove();
      // Late Google responses after timeout must not invoke a missing callback.
      window[cb] = () => {}; setTimeout(() => delete window[cb], 60000);
    };
    const finish = (error, data) => { if (done) return; done = true; cleanup(); error ? reject(error) : resolve(data); };
    const timer = setTimeout(() => finish(Error('Timeout Apps Script. Periksa koneksi dan akses anonim deployment.')), timeout);
    window[cb] = data => finish(null, data);
    script.onerror = () => finish(Error('GET JSONP gagal. Cache lokal tetap tersedia.'));
    const query = new URLSearchParams({action, callback:cb, _:String(Date.now())});
    for (const key of ['checker_id','request_id']) if (params[key]) query.set(key,params[key]);
    script.src = `${url}?${query}`;
    document.head.append(script);
  });
}
export function submitDestination(url, name, requestId) {
  endpointURL(url);
  const iframe = document.createElement('iframe');
  iframe.name = 'rkef_post_' + requestId; iframe.hidden = true; iframe.title = 'Pengiriman Destination';
  const form = document.createElement('form');
  form.method = 'POST'; form.action = url; form.target = iframe.name; form.hidden = true;
  form.enctype = 'application/x-www-form-urlencoded';
  for (const [key, value] of Object.entries({ action: 'addDestination', name, request_id: requestId })) {
    const input = document.createElement('input'); input.name = key; input.value = value; form.append(input);
  }
  document.body.append(iframe, form);
  try { form.submit(); } finally { setTimeout(() => { form.remove(); iframe.remove(); }, 60000); }
}
export function validateList(data) {
  if (!data?.ok || !Array.isArray(data.destinations) || data.count !== data.destinations.length) throw Error('Respons list Destination tidak valid: ' + (data?.code || 'schema'));
  const ids = new Set(), names = new Set();
  for (const d of data.destinations) {
    if (typeof d.destination_id !== 'string' || !d.destination_id || typeof d.destination_name !== 'string' || typeof d.request_id !== 'string') throw Error('Baris Destination tidak valid.');
    const name = destinationName(d.destination_name);
    if (name !== d.destination_name || ids.has(d.destination_id) || names.has(nameKey(name))) throw Error('Destination duplikat atau nama tidak kanonis dari server.');
    ids.add(d.destination_id); names.add(nameKey(name));
  }
  return data.destinations;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export class DestinationBridge {
  constructor(url, { get = jsonp, post = submitDestination, sleep = pause } = {}) { this.url = endpointURL(url); this.get = get; this.post = post; this.sleep = sleep; }
  async health() { const r = await this.get(this.url, 'health'); if (!r?.ok || r.service !== 'RKEF_DESTINATION') throw Error('Health Apps Script gagal.'); return r; }
  async list(attempts = 2) {
    let error;
    for (let i = 0; i < attempts; i++) {
      try { return validateList(await this.get(this.url, 'list')); }
      catch (e) { error = e; if (i + 1 < attempts) await this.sleep(800); }
    }
    throw error;
  }
  async verify(name, requestId, attempts = 5) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      if (i) await this.sleep(2000);
      try {
        const values = await this.list(1);
        const found = values.find(d => d.request_id === requestId && nameKey(d.destination_name) === nameKey(name));
        if (found) return { found, values };
        if (values.some(d => nameKey(d.destination_name) === nameKey(name) && d.request_id !== requestId)) throw Error('Nama sudah ada dengan request_id berbeda. Permintaan ini belum terbukti tersimpan.');
      } catch (e) { lastError = e; }
    }
    throw Error('BELUM TERVERIFIKASI: read-back request_id tidak ditemukan.' + (lastError ? ' ' + lastError.message : ' Periksa Sheet sebelum mencoba ulang.'));
  }
  async add(rawName, requestId) {
    const name = destinationName(rawName);
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) throw Error('request_id tidak valid.');
    const before = await this.list();
    if (before.some(d => d.request_id === requestId && nameKey(d.destination_name) === nameKey(name))) return { found: before.find(d => d.request_id === requestId), values: before };
    if (before.some(d => nameKey(d.destination_name) === nameKey(name))) throw Error('Nama sudah ada di Sheet. Refresh master; tidak ada penambahan terverifikasi untuk request ini.');
    this.post(this.url, name, requestId); // Only these three form fields are ever sent.
    await this.sleep(1500);
    return this.verify(name, requestId);
  }
}
export async function refreshDestinationCache(db, bridge) {
  try {
    const values = await bridge.list();
    const cache = { id: 'destinations', values, syncedAt: new Date().toISOString() };
    await db.put('cache', cache);
    return { cache, stale: false, error: null };
  } catch (error) { return { cache: await db.get('cache', 'destinations'), stale: true, error }; }
}
