(async () => {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const $ = s => document.querySelector(s);
  const { Database } = await import('./js/database.js');
  const { state } = await import('./js/state.js');
  const { renderReport } = await import('./js/report-ui.js');
  const { fillDraft } = await import('./js/operational-ui.js');
  for (const id of ['filter-form','active-filter','clear-filter','backup','restore-file','restore-preview','restore-mode','confirm-restore']) assert(!$('#'+id), 'Obsolete UI: '+id);
  assert(!$('#view-report form') && !$('#view-report input') && !$('#view-report select'), 'Report filter controls remain');
  assert(!document.body.textContent.includes('CADANGAN PERANGKAT'), 'Backup card remains');
  const db = await Database.open(), backup = await db.backup();
  const previous = { session: structuredClone(state.session), records: structuredClone(state.records), draft: structuredClone(state.draft) };
  const clip = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const exec = document.execCommand, click = HTMLAnchorElement.prototype.click;
  let copied, downloaded;
  try {
    const session = { operationDate: '2026-10-25', shift: 'DS', scale: 'BDM', checker: 'REPORT TEST', handoverConfirmed: true, handoverId: 'report-browser', activationId: 'report-activation', startNumber: 1, nextNumber: 606, nextRitase: '46320-606' };
    const base = { operationDate: session.operationDate, shift: 'DS', scale: 'BDM', checker: 'REPORT TEST', numberingSession: session.handoverId, activationId: session.activationId, origin: 'local', dtNo: 'SAP_820', sourceCode: '4', stockpile: 'REPORT_STOCK', productCode: '1', dome: 'REPORT_DOME', destination: 'REPORT DESTINATION', time: '15.23.59', sourceTime: '15.23.59', timePrecision: 'second', revision: 1, createdAt: '2026-10-25T00:00:00Z' };
    const rows = Array.from({ length: 605 }, (_, i) => { const row = { ...base, id: `report-${String(i).padStart(4,'0')}`, ritaseNumber: i+1, pileId: i < 400 ? 'PILE_A' : 'PILE_B' }; return { ...row, sourceSnapshot: structuredClone(row) }; });
    await db.transaction(['records','settings'], 'readwrite', stores => { for (const row of rows) stores.records.put(row); stores.settings.put({ id: 'session', value: session }); });
    state.session = session; state.records = (await db.snapshot()).records; renderReport();
    assert($('#report-count').textContent === '605', 'Trip total');
    assert($('#report-piles tbody tr').textContent.includes('PILE_A400'), 'Pile count/order');
    assert($('#report-piles tfoot').textContent.includes('605'), 'TOTAL row');
    assert($('#report-session').textContent.includes('25/10/2026'), 'Session date');
    assert($('#report-output').value.split('\n').length === 605, 'Full preview text');
    assert(!$('#report-preview').open, 'Preview should start collapsed');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
    await $('#copy-report').onclick();
    assert(copied?.split('\n').length === 605 && copied.includes('\t\t'), 'Full clipboard uses real TAB');
    assert(copied.split('\n').every(line => line.split('\t').length === 11 && [2,5,6].every(i => line.split('\t')[i] === '') && line.split('\t')[7] === 'REPORT_DOME' && line.split('\t')[8] === 'REPORT DESTINATION' && line.split('\t')[9] === '15.23'), '11 columns/empty sixth/truncated seconds');
    assert($('#report-status').textContent.includes('605 ritase disalin'), 'Copy status');
    navigator.clipboard.writeText = async () => { throw Error('blocked'); };
    document.execCommand = () => false;
    await $('#copy-report').onclick();
    assert($('#report-preview').open && $('#report-output').selectionEnd === $('#report-output').value.length, 'Fallback selects whole report');
    assert($('#report-status').textContent.includes('Clipboard dibatasi'), 'Fallback honest failure');
    document.execCommand = command => command === 'copy';
    await $('#copy-report').onclick(); assert($('#report-status').textContent.includes('605 ritase disalin'), 'Fallback copy success');
    HTMLAnchorElement.prototype.click = function () { downloaded = { href: this.href, name: this.download }; };
    await $('#export-txt').onclick();
    assert(downloaded?.name === 'RKEF-2026-10-25-DS-BDM.txt', 'TXT session filename');
    assert(await (await fetch(downloaded.href)).text() === copied, 'TXT equals complete clipboard');
    const corrected = { ...rows[0], pileId: 'PILE_B' }; await db.put('records', corrected);
    state.records = (await db.snapshot()).records; renderReport();
    assert($('#report-piles tbody tr').textContent.includes('PILE_A399'), 'Persisted pile correction');
    assert($('#report-count').textContent === '605', 'Correction preserves total');
    // A bad/stale snapshot cannot slip through an export click even before BroadcastChannel refresh.
    await db.put('records', { ...rows[1], ritaseNumber: 1 });
    copied = null; navigator.clipboard.writeText = async text => { copied = text; };
    await $('#copy-report').onclick();
    assert(copied === null && $('#copy-report').disabled && $('#export-txt').disabled && !$('#report-output').value && !$('#report-error').hidden, 'Duplicate blocks all export, no stale text');
    await db.put('records', rows[1]);
    await db.put('settings', { id: 'session', value: { ...session, startNumber: undefined, nextNumber: 1, nextRitase: '46320-001', activationId: 'new-activation' } });
    copied = null; await $('#copy-report').onclick();
    assert(copied === null && $('#report-count').textContent === '0' && $('#copy-report').disabled, 'New activation cannot report previous work');
    assert($('#report-empty').textContent === 'Belum ada ritase pada sesi ini.' && $('#report-piles tfoot').textContent.includes('0'), 'Empty active session TOTAL 0');
    await db.put('settings', { id: 'session', value: null });
    await $('#copy-report').onclick();
    assert(!$('#report-output').value && $('#report-sections').hidden && $('#copy-report').disabled, 'No active session clears old report');
    assert($('#report-empty').textContent === 'Belum ada sesi aktif. Lakukan handover di halaman Setup.', 'No session instruction');
  } finally {
    if (clip) Object.defineProperty(navigator, 'clipboard', clip); else delete navigator.clipboard;
    document.execCommand = exec; HTMLAnchorElement.prototype.click = click;
    await db.restore(backup, 'replace'); db.db.close();
    Object.assign(state, previous); fillDraft(); renderReport();
  }
  return 'PASS Report: no filters/backup UI, 605 same-DT trips, full TAB clipboard/TXT, safe clipboard fallback, pile correction, duplicate/stale export blocks, activation isolation and empty/no-session states (synthetic IndexedDB)';
})()
