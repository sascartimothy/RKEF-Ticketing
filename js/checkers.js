import { destinationName, nameKey } from './validation.js';
import { endpointURL, jsonp } from './apps-script-api.js';
export const checkerName = raw => {
  if (typeof raw !== 'string' || /[\u2028\u2029]/.test(raw)) throw Error('Nama Checker tidak valid.');
  return destinationName(raw);
};
export function normalizeCheckers(values, limit = 50) {
  if (!Array.isArray(values) || values.length > limit) throw Error('Maksimal 50 checker per sesi.');
  const ids = new Set(), names = new Set();
  return values.map(row => {
    if (!row || typeof row.checker_id !== 'string' || !row.checker_id || row.checker_id.length > 160 || /[<>\u0000-\u001f]/.test(row.checker_id)) throw Error('ID Checker tidak valid.');
    const name = checkerName(row.name);
    if (name !== row.name || ids.has(row.checker_id) || names.has(nameKey(name))) throw Error('Checker duplikat atau nama tidak kanonis.');
    ids.add(row.checker_id); names.add(nameKey(name));
    return { checker_id: row.checker_id, name };
  }).sort((a,b) => a.checker_id < b.checker_id ? -1 : a.checker_id > b.checker_id ? 1 : 0);
}
export const checkerText = value => value?.checkers !== undefined ? normalizeCheckers(value.checkers).map(c => c.name).join('; ') : value?.checker || '';
export const validListVersion = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validateCheckers(data, { legacyCache = false } = {}) {
  if (!data?.ok || !Array.isArray(data.checkers) || data.count !== data.checkers.length) throw Error('API Checker belum tersedia / respons tidak valid: ' + (data?.code || 'schema'));
  normalizeCheckers(data.checkers, 20000);
  return data.checkers.map(row => {
    const revision = row.revision ?? (legacyCache ? row.version : undefined);
    if ((row.is_active !== undefined && row.is_active !== true) || !Number.isSafeInteger(revision) || revision < 1 || typeof row.request_id !== 'string') throw Error('Metadata Checker tidak valid.');
    return {checker_id:row.checker_id,name:row.name,is_active:true,revision,request_id:row.request_id};
  });
}
export function submitChecker(url, fields, onReply = () => {}) {
  endpointURL(url); validateCheckerRequest(fields);
  const iframe = document.createElement('iframe'), form = document.createElement('form');
  iframe.name = 'checker_' + crypto.randomUUID(); iframe.hidden = true; iframe.title = 'Pengiriman master Checker';
  form.method = 'POST'; form.action = url; form.target = iframe.name; form.hidden = true;
  form.enctype = 'application/x-www-form-urlencoded';
  for (const [key,value] of Object.entries(fields)) { const input = document.createElement('input'); input.name = key; input.value = value; form.append(input); }
  const receive = event => {
    if (!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(event.origin)) return;
    const reply = event.data?.payload;
    if (event.data?.kind !== 'RKEF_CHECKER_RESULT' || reply?.request_id !== fields.request_id) return;
    onReply(reply); // Error feedback only; success always requires independent GET.
  };
  let timer;
  const cleanup = () => { clearTimeout(timer); window.removeEventListener('message',receive); form.remove(); iframe.remove(); };
  window.addEventListener('message',receive); document.body.append(iframe, form);
  timer = setTimeout(cleanup,60000);
  try { form.submit(); } catch(e) { cleanup(); throw e; }
  finally { form.remove(); }
  return cleanup;
}
const messages = {
  VERSION_CONFLICT:'Daftar Checker berubah di perangkat lain. Data terbaru diambil; tinjau ulang perubahan.',
  DUPLICATE_NAME:'Nama Checker duplikat. Gunakan nama lain.', INVALID_NAME:'Nama Checker tidak valid.',
  REQUEST_ID_REUSE:'request_id sudah digunakan untuk isi berbeda. Permintaan ditahan; periksa hasil semula.'
};
export function checkerError(code, detail = '') {
  const error = Error((messages[code] || 'BELUM TERVERIFIKASI: ' + (detail || code)));
  error.code = code; return error;
}
export function validateCheckerRequest(payload) {
  const allowed = payload?.action === 'addChecker' ? ['action','name','request_id','expected_version'] : payload?.action === 'editChecker' ? ['action','checker_id','name','request_id','expected_version'] : payload?.action === 'deleteChecker' ? ['action','checker_id','request_id','expected_version'] : [];
  if (!allowed.length || Object.keys(payload).sort().join() !== allowed.sort().join() || !/^[A-Za-z0-9_-]{12,100}$/.test(payload.request_id || '') || !validListVersion(payload.expected_version)) throw Error('Permintaan Checker tidak valid. Sync daftar terbaru sebelum mengelola master.');
  if (payload.action !== 'addChecker' && (typeof payload.checker_id !== 'string' || !/^CHK-[A-Za-z0-9_-]{8,100}$/.test(payload.checker_id))) throw Error('ID Checker tidak valid.');
  if (payload.action !== 'deleteChecker' && checkerName(payload.name) !== payload.name) throw checkerError('INVALID_NAME');
  return payload;
}
export function validateCheckerStatus(data) {
  try {
    if (!data?.ok || !/^CHK-[A-Za-z0-9_-]{8,100}$/.test(data.checker_id || '') || checkerName(data.name) !== data.name || typeof data.is_active !== 'boolean' || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.request_id !== 'string' || !validListVersion(data.list_version)) throw Error('schema');
  } catch { throw checkerError('SCHEMA','Respons status Checker tidak valid. Permintaan tetap belum terverifikasi.'); }
  return data;
}
export class CheckerBridge {
  constructor(url, {get = jsonp, post = submitChecker, sleep = ms => new Promise(r => setTimeout(r,ms))} = {}) { this.url = endpointURL(url); this.get = get; this.post = post; this.sleep = sleep; }
  async list() {
    const data = await this.get(this.url,'listCheckers');
    const values = validateCheckers(data);
    if (!validListVersion(data.list_version)) throw Error('Token list_version Checker tidak valid.');
    return {values,listVersion:data.list_version};
  }
  async verify(payload, attempts = 5, rejected = () => null) {
    validateCheckerRequest(payload);
    for (let i=0;i<attempts;i++) {
      if (i) await this.sleep(1500);
      if (rejected()) throw rejected();
      const data = await this.get(this.url,'checkerStatus',12000,{...(payload.checker_id ? {checker_id:payload.checker_id} : {}),request_id:payload.request_id});
      if (rejected()) throw rejected();
      if (!data?.ok) {
        if (data?.code === 'NOT_FOUND') continue;
        throw checkerError(data?.code || 'SCHEMA');
      }
      validateCheckerStatus(data);
      if (data.request_id !== payload.request_id) {
        if (data.list_version !== payload.expected_version) throw checkerError('VERSION_CONFLICT');
        continue;
      }
      if (typeof data.checker_id !== 'string' || !data.checker_id || (payload.checker_id && data.checker_id !== payload.checker_id) || !Number.isSafeInteger(data.revision) || data.revision < 1 || data.is_active !== (payload.action !== 'deleteChecker') || (payload.action !== 'deleteChecker' && data.name !== payload.name) || !validListVersion(data.list_version)) throw checkerError('READBACK_MISMATCH');
      const result = await this.list();
      const listed = result.values.find(c => c.checker_id === data.checker_id);
      if (result.listVersion !== data.list_version || (data.is_active ? (!listed || ['checker_id','name','revision','request_id'].some(k => listed[k] !== data[k])) : !!listed)) throw checkerError('VERSION_CONFLICT');
      return result;
    }
    if (rejected()) throw rejected();
    throw checkerError('UNVERIFIED','request_id Checker belum ditemukan. Cek read-back atau kirim ulang ID yang sama.');
  }
  async mutate(payload) {
    validateCheckerRequest(payload);
    // Retry first checks the same request. Never issue a new POST after an ambiguous GET failure.
    const prior = await this.get(this.url,'checkerStatus',12000,{request_id:payload.request_id});
    if (prior?.ok) validateCheckerStatus(prior);
    if (prior?.ok && prior.request_id === payload.request_id) {
      if ((payload.checker_id && payload.checker_id !== prior.checker_id) || prior.is_active !== (payload.action !== 'deleteChecker') || (payload.action !== 'deleteChecker' && prior.name !== payload.name)) throw checkerError('REQUEST_ID_REUSE');
      return this.verify(payload);
    }
    if (prior?.ok || prior?.code !== 'NOT_FOUND') throw checkerError(prior?.code || 'SCHEMA');
    const before = await this.list();
    if (before.listVersion !== payload.expected_version) throw checkerError('VERSION_CONFLICT');
    if (payload.action !== 'deleteChecker' && before.values.some(c => c.checker_id !== payload.checker_id && nameKey(c.name) === nameKey(payload.name))) throw checkerError('DUPLICATE_NAME');
    let rejection = null;
    const cleanup = this.post(this.url, {...payload}, reply => { if (reply?.ok === false) rejection = checkerError(reply.code || 'SERVER_ERROR'); });
    try { await this.sleep(1500); return await this.verify(payload,5,() => rejection); }
    finally { if (typeof cleanup === 'function') cleanup(); }
  }
}
