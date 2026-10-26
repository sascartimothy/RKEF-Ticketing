/**
 * RKEF Ticketing v0.9 — anonymous Destination bridge (Google Apps Script).
 * Sheet: MASTER_DESTINATION, columns A:H.
 * IMPORTANT: public execute-as-owner endpoint. This provides no caller identity.
 * Destination routes preserved; Checker_Crew mutations are anonymous by owner decision.
 * No ritase, stockpile or dome is stored here. Checker names are shared master.
 *
 * Release integration gate: verify JSONP GET + cross-origin form POST from
 * https://sascartimothy.github.io/RKEF-Ticketing/ on actual Android devices.
 */
const RKEF_SHEET_ID = '1iTs3-TJT8xCXWVUANEtk6MOxP25HjqkH-JHdTKnY1kE';
const RKEF_TAB = 'MASTER_DESTINATION';
const RKEF_VERSION = '0.9.0';
const RKEF_COLUMNS = [
  'destination_id', 'destination_name', 'is_active', 'source',
  'created_at_utc', 'updated_at_utc', 'updated_by', 'request_id'
];

/** Anonymous GET is JSONP if `callback` is present; otherwise plain JSON. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  let response;
  try {
    if (p.action === 'health') {
      response = { ok: true, version: RKEF_VERSION, service: 'RKEF_DESTINATION' };
    } else if (p.action === 'listCheckers') {
      response = listCheckers_();
    } else if (p.action === 'checkerStatus') {
      response = checkerStatus_(p);
    } else if (p.action === 'list') {
      response = listDestinations_();
    } else {
      response = { ok: false, code: 'UNKNOWN_ACTION' };
    }
  } catch (err) {
    console.error(err);
    response = { ok: false, code: 'SERVER_ERROR' };
  }
  return encodeResponse_(response, p.callback);
}

/**
 * Anonymous POST uses form-encoded fields, suitable for a regular HTML form
 * submitted to a hidden cross-origin iframe. The reply is not trusted by the
 * PWA; it confirms an addition by a fresh doGet?action=list&callback=... read,
 * matching request_id. This avoids claiming opaque no-cors writes succeeded.
 */
function doPost(e) {
  const p = (e && e.parameter) || {};
  let result;
  try {
    if (['addChecker','editChecker','deleteChecker'].indexOf(p.action) !== -1) {
      result = checkerMutation_(p);
    } else if (p.action !== 'addDestination') {
      result = { ok: false, code: 'UNKNOWN_ACTION' };
    } else {
      result = addDestination_(p.name, p.request_id);
    }
  } catch (err) {
    console.error(err);
    result = { ok: false, code: 'SERVER_ERROR' };
  }
  // Browser integrations MUST independently verify by doGet/list.
  const isChecker = ['addChecker','editChecker','deleteChecker'].indexOf(p.action) !== -1;
  if (isChecker) result.request_id = String(p.request_id || '');
  const json = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head>' +
    '<body><p>RKEF Destination result</p><script>' +
    (isChecker ? 'window.top.postMessage({kind:"RKEF_CHECKER_RESULT",payload:' + json + '},"*");' : 'window.parent.postMessage({kind:"RKEF_DESTINATION_RESULT",payload:' + json + '},"*");') +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function listDestinations_() {
  const sheet = masterSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow <= 1 ? [] : sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const values = [];
  rows.forEach(row => {
    const id = String(row[0] || '').trim();
    const name = normalizeName_(row[1]);
    if (!id || !name || !active_(row[2])) return;
    values.push({ destination_id: id, destination_name: name,
      request_id: String(row[7] || '') });
  });
  return { ok: true, version: RKEF_VERSION, count: values.length, destinations: values };
}

function addDestination_(rawName, rawRequestId) {
  const name = normalizeName_(rawName);
  const requestId = String(rawRequestId || '').trim();
  if (!validName_(name)) return { ok: false, code: 'INVALID_NAME' };
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId))
    return { ok: false, code: 'INVALID_REQUEST_ID' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = masterSheet_();
    const lastRow = sheet.getLastRow();
    const rows = lastRow <= 1 ? [] : sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (String(row[7] || '') === requestId) {
        return { ok: true, code: 'ALREADY_APPLIED', request_id: requestId,
          destination_id: String(row[0] || ''), destination_name: normalizeName_(row[1]) };
      }
    }
    for (let i = 0; i < rows.length; i++) {
      if (nameKey_(rows[i][1]) === nameKey_(name)) {
        return { ok: false, code: 'DUPLICATE_NAME',
          destination_name: normalizeName_(rows[i][1]) };
      }
    }
    const id = 'DST-' + Utilities.getUuid();
    const now = new Date().toISOString();
    // Entire row in one append. Request ID makes client-side read-back possible.
    sheet.appendRow([id, name, true, 'PWA', now, now, 'ANONYMOUS', requestId]);
    SpreadsheetApp.flush();
    return { ok: true, code: 'CREATED', destination_id: id,
      destination_name: name, request_id: requestId };
  } finally {
    lock.releaseLock();
  }
}

function masterSheet_() {
  const sheet = SpreadsheetApp.openById(RKEF_SHEET_ID).getSheetByName(RKEF_TAB);
  if (!sheet) throw new Error('MASTER_DESTINATION tab missing');
  const header = sheet.getRange(1, 1, 1, 8).getValues()[0];
  if (header.join('|') !== RKEF_COLUMNS.join('|'))
    throw new Error('Master schema mismatch: expected eight columns A:H');
  return sheet;
}

function active_(value) {
  return value === true || String(value).trim().toUpperCase() === 'TRUE';
}
function normalizeName_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, ' ').trim();
}
function nameKey_(value) { return normalizeName_(value).toLocaleUpperCase('en-US'); }
function validName_(name) {
  // No formulas, controls, HTML tags or misleading line separators.
  return name.length >= 2 && name.length <= 80 &&
    !/^[=+@'-]/.test(name) && !/[<>\r\n\t\u0000-\u001f\u007f]/.test(name);
}
function encodeResponse_(obj, callback) {
  const body = JSON.stringify(obj).replace(/</g, '\\u003c');
  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,60}$/.test(String(callback))) {
      return ContentService.createTextOutput('{"ok":false,"code":"BAD_CALLBACK"}')
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(String(callback) + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Check the live sheet data manually via Run in the Apps Script editor. */
function verifyInstallation() {
  const result = listDestinations_();
  console.log(JSON.stringify({ version: RKEF_VERSION, count: result.count,
    first: result.destinations.length ? result.destinations[0].destination_name : null }));
  return result;
}

/** Anonymous Checker extension. Existing Checker_Crew A:F is never initialized,
 * reseeded, or assigned replacement IDs. Local candidate; owner manages deployment.
 */
const CHECKER_COLUMNS = ['Nama','checker_id','is_active','updated_at_utc','revision','request_id'];
function checkerSheet_() {
  const sheet = SpreadsheetApp.openById(RKEF_SHEET_ID).getSheetByName('Checker_Crew');
  if (!sheet || sheet.getRange(1,1,1,6).getValues()[0].join('|') !== CHECKER_COLUMNS.join('|')) throw Error('Checker_Crew schema missing/mismatch');
  return sheet;
}
function checkerRows_(sheet) {
  const rows = sheet.getLastRow() <= 1 ? [] : sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues();
  const ids = {}, names = {};
  rows.forEach(row => {
    const id = String(row[1] || ''), name = String(row[0] || '');
    if (!/^CHK-[A-Za-z0-9_-]{8,100}$/.test(id) || ids[id] || !validName_(name) || normalizeName_(name) !== name || !Number.isSafeInteger(Number(row[4])) || Number(row[4]) < 1) throw Error('Invalid Checker row; no implicit repair');
    if (active_(row[2]) && names[nameKey_(name)]) throw Error('Duplicate active Checker');
    ids[id] = true; if (active_(row[2])) names[nameKey_(name)] = true;
  });
  return rows;
}
function checkerObject_(row) {
  return {checker_id:String(row[1]),name:String(row[0]),revision:Number(row[4]),request_id:String(row[5] || '')};
}
function checkerListVersion_(rows) {
  const stable = rows.map(r => [String(r[1]),String(r[0]),active_(r[2]),Number(r[4]),String(r[5] || '')]).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(stable),Utilities.Charset.UTF_8).map(b => ('0' + ((b+256)%256).toString(16)).slice(-2)).join('');
}
function listCheckers_() {
  const rows = checkerRows_(checkerSheet_()), checkers = rows.filter(r => active_(r[2])).map(checkerObject_);
  return {ok:true,version:RKEF_VERSION,list_version:checkerListVersion_(rows),count:checkers.length,checkers:checkers};
}
function checkerStatus_(p) {
  const rows = checkerRows_(checkerSheet_());
  const row = (p.request_id && rows.find(r => String(r[5]) === String(p.request_id))) || (p.checker_id && rows.find(r => String(r[1]) === String(p.checker_id)));
  if (!row) return {ok:false,code:'NOT_FOUND'};
  return Object.assign({ok:true},checkerObject_(row),{is_active:active_(row[2]),list_version:checkerListVersion_(rows)});
}
function checkerMutation_(p) {
  if (p.action === 'addChecker' && p.checker_id) return {ok:false,code:'INVALID_CHECKER_ID'};
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(String(p.request_id || ''))) return {ok:false,code:'INVALID_REQUEST_ID'};
  if (!/^[a-f0-9]{64}$/.test(String(p.expected_version || ''))) return {ok:false,code:'VERSION_CONFLICT'};
  if (p.action !== 'addChecker' && !/^CHK-[A-Za-z0-9_-]{8,100}$/.test(String(p.checker_id || ''))) return {ok:false,code:'INVALID_CHECKER_ID'};
  const name = normalizeName_(p.name);
  if (p.action !== 'deleteChecker' && (!validName_(name) || /[\u0000-\u001f\u007f\u2028\u2029]/.test(String(p.name)))) return {ok:false,code:'INVALID_NAME'};
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = checkerSheet_(), rows = checkerRows_(sheet);
    const used = rows.find(r => String(r[5]) === p.request_id);
    if (used) {
      const matches = (p.action === 'addChecker' ? Number(used[4]) === 1 : used[1] === p.checker_id) && active_(used[2]) === (p.action !== 'deleteChecker') && (p.action === 'deleteChecker' || used[0] === name);
      return matches ? Object.assign({ok:true,code:'ALREADY_APPLIED'},checkerObject_(used)) : {ok:false,code:'REQUEST_ID_REUSE'};
    }
    if (checkerListVersion_(rows) !== p.expected_version) return {ok:false,code:'VERSION_CONFLICT'};
    const index = rows.findIndex(r => String(r[1]) === p.checker_id), previous = rows[index];
    if (p.action !== 'addChecker' && (!previous || !active_(previous[2]))) return {ok:false,code:'VERSION_CONFLICT'};
    if (p.action !== 'deleteChecker' && rows.some(r => r[1] !== p.checker_id && nameKey_(r[0]) === nameKey_(name))) return {ok:false,code:'DUPLICATE_NAME'};
    const row = [p.action === 'deleteChecker' ? previous[0] : name,previous ? previous[1] : 'CHK-' + Utilities.getUuid(),p.action !== 'deleteChecker',new Date().toISOString(),previous ? Number(previous[4])+1 : 1,p.request_id];
    if (previous) sheet.getRange(index+2,1,1,6).setValues([row]); else sheet.appendRow(row);
    SpreadsheetApp.flush();
    return Object.assign({ok:true},checkerObject_(row),{is_active:active_(row[2])});
  } finally { lock.releaseLock(); }
}
