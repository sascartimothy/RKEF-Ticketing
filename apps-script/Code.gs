/**
 * RKEF Ticketing v0.9 — anonymous Destination bridge (Google Apps Script).
 * Sheet: MASTER_DESTINATION, columns A:H.
 * IMPORTANT: public execute-as-owner endpoint. This provides no caller identity.
 * Only reads active destinations and adds distinct Destination names.
 * No ritase, stockpile, dome, or user info is stored here.
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
    if (p.action !== 'addDestination') {
      result = { ok: false, code: 'UNKNOWN_ACTION' };
    } else {
      result = addDestination_(p.name, p.request_id);
    }
  } catch (err) {
    console.error(err);
    result = { ok: false, code: 'SERVER_ERROR' };
  }
  // Browser integrations MUST independently verify by doGet/list.
  const json = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head>' +
    '<body><p>RKEF Destination result</p><script>' +
    'window.parent.postMessage({kind:"RKEF_DESTINATION_RESULT",payload:' + json + '},"*");' +
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
