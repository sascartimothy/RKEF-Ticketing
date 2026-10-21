(async () => {
  const { Database } = await import('./js/database.js');
  const { state } = await import('./js/state.js');
  const db = await Database.open();
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
  const until = async fn => { for (let i = 0; i < 200; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 30)); } throw Error('Reuse UI timeout'); };
  await until(() => state.ready);
  // Runner uses a fresh temporary browser profile; restore this synthetic baseline afterwards.
  sessionStorage.setItem('reuseBaseline', JSON.stringify(await db.backup()));
  const source = Array.from({ length: 83 }, (_, i) => [`46315-${String(i + 1).padStart(3, '0')}`, `SAP_${900 + i}`, '4', 'REUSE_STOCK', 'REUSE_PILE', '', '1', 'REUSE_DOME', 'REUSE DESTINATION', '7.2', 'BDM'].join('\t')).join('\n');
  const paste = async () => {
    const el = document.querySelector('#wa-source');
    el.value = source;
    el.dispatchEvent(new Event('paste', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => !state.sessionTransition);
  };
  await paste();
  const expected = { operationDate: '2026-10-20', shift: 'NS', scale: 'BDM', nextRitase: '46315-084', checker: '' };
  const verify = () => { for (const [k, v] of Object.entries(expected)) equal(state.session?.[k], v, 'Wrong reused session: ' + k); };
  verify();
  document.querySelector('#checker-form').elements.checker.value = 'RESET TEST CHECKER';
  document.querySelector('#checker-form').requestSubmit();
  await until(() => state.session.checker === 'RESET TEST CHECKER');
  location.hash = 'operasional';
  await until(() => state.draft && !document.querySelector('#view-operasional').hidden);
  const saveUI = async dt => {
    const form = document.querySelector('#entry-form');
    form.elements.dtNo.value = dt;
    form.elements.dtNo.dispatchEvent(new Event('input', { bubbles: true }));
    for (const kind of ['stock', 'product']) {
      const select = form.querySelector(`[data-mapping="${kind}"]`);
      select.value = [...select.options].find(o => o.value)?.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    form.requestSubmit();
    await until(() => state.records.some(r => r.origin === 'local' && r.dtNo === 'SAP_' + dt));
    await until(() => !document.querySelector('#save-entry').disabled);
  };
  for (const dt of ['820', '821', '822']) await saveUI(dt);
  const first = await db.snapshot(), oldSession = structuredClone(state.session);
  const local = first.records.filter(r => r.origin === 'local');
  equal(local.map(r => r.ritaseNumber).sort(), [84, 85, 86], 'Three local numbers');
  const oldDraft = structuredClone(state.draft);
  // Independent database checks scope, tombstones, audit cleanup, ambiguity and rollback.
  const scoped = await Database.open(indexedDB, 'rkef-reset-scope-' + crypto.randomUUID());
  await scoped.restore(await db.backup());
  const other = [
    { ...local[0], id: 'other-scale', scale: 'ONI' },
    { ...local[0], id: 'other-shift', shift: 'DS', ritaseNumber: 90 },
    { ...local[0], id: 'other-date', operationDate: '2026-10-19' },
    { ...local[0], id: 'prior-activation', activationId: 'older', ritaseNumber: 91 }
  ];
  for (const r of other) await scoped.put('records', r);
  await scoped.put('settings', { id: 'reset-test-config', value: 'keep' });
  await scoped.put('cache', { id: 'destinations', syncedAt: new Date().toISOString(), values: [{ destination_id: 'DST-RESET', destination_name: 'RESET SHARED DESTINATION', request_id: '' }] });
  await scoped.put('records', { ...local[0], id: 'tombstone', ritaseNumber: 87, deletedAt: new Date().toISOString() });
  await scoped.put('audit', { id: 'tombstone-audit', recordId: 'tombstone', action: 'delete', at: new Date().toISOString(), before: local[0] });
  await scoped.saveDraft(oldDraft);
  const stable = await scoped.snapshot(), transactionScoped = scoped.transaction;
  scoped.transaction = function(names, mode, work) {
    return transactionScoped.call(this, names, mode, async stores => { await work(stores); throw Error('TEST full reset rollback'); });
  };
  try { await scoped.endSession(oldSession, oldDraft); throw Error('Reset accepted injected failure'); }
  catch (error) { assert(error.message.includes('TEST full reset rollback'), error.message); }
  scoped.transaction = transactionScoped;
  equal(await scoped.snapshot(), stable, 'Full reset partially committed');
  await scoped.put('records', { ...local[0], id: 'ambiguous', activationId: undefined, ritaseNumber: 92 });
  const ambiguous = await scoped.snapshot();
  try { await scoped.endSession(oldSession, oldDraft); throw Error('Ambiguous reset accepted'); }
  catch (error) { assert(error.message.includes('tidak dapat dipastikan'), error.message); }
  equal(await scoped.snapshot(), ambiguous, 'Ambiguous reset changed data');
  await scoped.transaction(['records'], 'readwrite', s => s.records.delete('ambiguous'));
  await scoped.endSession(oldSession, oldDraft);
  const scopeAfter = await scoped.snapshot();
  const stalePeer = await Database.open(indexedDB, scoped.db.name);
  for (const write of [() => stalePeer.saveDraft(oldDraft), () => stalePeer.saveRecord(local[0], { expectedRevision: local[0].revision })]) {
    let rejected = false;
    try { await write(); } catch { rejected = true; }
    assert(rejected, 'Stale connection recreated discarded data');
  }
  equal(await scoped.snapshot(), scopeAfter, 'Stale connection changed reset state');
  stalePeer.db.close();
  equal(scopeAfter.records.filter(r => r.origin === 'local'), other.sort((a,b) => a.id.localeCompare(b.id)), 'Reset crossed scope or retained tombstone');
  equal(scopeAfter.audit.find(a => a.action === 'session-reset').deletedCount, 4, 'Reset count includes tombstone');
  assert(!scopeAfter.audit.some(a => [...local.map(r => r.id), 'tombstone'].includes(a.recordId)), 'Deleted audit survived');
  for (const name of ['masters', 'imports', 'cache', 'pending']) equal(scopeAfter[name], stable[name], 'Reset changed ' + name);
  assert(!scopeAfter.settings.some(s => ['session', 'draft'].includes(s.id)), 'Reset retained session metadata');
  equal(scopeAfter.settings.find(s => s.id === 'reset-test-config').value, 'keep', 'Reset deleted configuration');
  try { await scoped.importHandover({ source }); throw Error('Outside-scope conflict ignored'); }
  catch (error) { assert(error.message.includes('bertabrakan'), error.message); }
  const noSession = await scoped.snapshot();
  await scoped.endSession(null, null);
  equal(await scoped.snapshot(), noSession, 'No session deleted history');
  const restored = await Database.open(indexedDB, scoped.db.name + '-restore');
  await restored.restore(await scoped.backup());
  equal(await restored.snapshot(), scopeAfter, 'Reset backup incompatible');
  scoped.db.close(); restored.db.close();
  // Confirm cancel leaves the full database unchanged, then discard the three real UI saves.
  location.hash = 'setup';
  document.querySelector('#new-session').click();
  await until(() => document.querySelector('#confirm-dialog').open);
  equal(document.querySelector('#confirm-title').textContent, 'Mulai Sesi Baru?', 'Reset title');
  equal(document.querySelector('#confirm-ok').textContent, 'Hapus Sesi & Mulai Baru', 'Destructive action label');
  document.querySelector('#confirm-dialog button[value="cancel"]').click();
  await until(() => !document.querySelector('#new-session').disabled);
  equal(await db.snapshot(), first, 'Cancel changed session or transactions');
  document.querySelector('#new-session').click();
  await until(() => document.querySelector('#confirm-dialog').open);
  document.querySelector('#confirm-ok').click();
  await until(() => !state.sessionTransition);
  equal(state.session, null, 'Reset left active session');
  equal(await db.get('settings', 'session'), undefined, 'Reset not persisted');
  const ended = await db.snapshot();
  equal(ended.records, first.records.filter(r => r.origin === 'import'), 'Reset retained local records or altered imports');
  equal(ended.audit.find(a => a.action === 'session-reset').deletedCount, 3, 'Wrong reset audit count');
  assert(document.querySelector('#entry-fields').disabled, 'Reset left input enabled');
  equal(document.querySelector('#history-count').textContent, '0', 'History retained deleted records');
  assert(!document.querySelector('#entry-context').textContent.includes('46315-087'), 'Stale next number');
  (await import('./js/report-ui.js')).renderReport();
  equal(document.querySelector('#report-count').textContent, '0', 'Inactive Report includes historical records');
  try { await db.saveDraft(oldDraft); throw Error('Stale autosave accepted'); }
  catch (error) { assert(error.message.includes('Sesi draft'), error.message); }
  // Inject failure after reuse writes are queued, inside the real IndexedDB transaction.
  const transaction = Database.prototype.transaction;
  Database.prototype.transaction = function(names, mode, work) {
    return transaction.call(this, names, mode, async stores => {
      const result = await work(stores);
      if (mode === 'readwrite' && names.includes('imports')) throw Error('TEST reuse rollback');
      return result;
    });
  };
  try { await paste(); } finally { Database.prototype.transaction = transaction; }
  equal(await db.snapshot(), ended, 'Reuse failed to roll back');
  equal(state.session, null, 'Failed reuse claimed active session');
  assert(document.querySelector('#import-preview').classList.contains('danger'), 'Reuse failure shown as success');
  await paste(); verify();
  assert(state.session.activationId !== oldSession.activationId, 'Reuse retained stale activation identity');
  try { await db.saveDraft({ id: 'stale', session: oldSession, dirty: true }); throw Error('Stale draft accepted'); }
  catch (error) { assert(error.message.includes('Sesi draft'), error.message); }
  assert(document.querySelector('#session-details').textContent.includes('46315-084'), 'Session card not updated');
  equal(document.querySelector('#import-preview').textContent, 'Handover berhasil. Sesi operasional telah diaktifkan.', 'Wrong reuse message');
  const reused = await db.snapshot();
  equal(reused.records, first.records.filter(r => r.origin === 'import'), 'Duplicated or changed imports');
  for (const name of ['imports', 'masters']) equal(reused[name], first[name], 'Duplicated or changed ' + name);
  equal(reused.records.length, 83, 'History count'); equal(reused.imports.length, 1, 'Receipt count');
  assert(reused.audit.some(a => a.action === 'handover-activate'), 'Missing reuse audit');
  await paste(); equal(await db.snapshot(), reused, 'Repeated paste changed data');
  try { await db.saveRecord({ ...local[0], id: crypto.randomUUID() }, { duplicateConfirmed: true }); throw Error('Stale save accepted'); }
  catch (error) { assert(error.message.includes('Sesi') || error.message.includes('sesi'), error.message); }
  document.querySelector('#checker-form').elements.checker.value = 'RESET TEST CHECKER';
  document.querySelector('#checker-form').requestSubmit();
  await until(() => state.session.checker === 'RESET TEST CHECKER');
  location.hash = 'operasional';
  await saveUI('823');
  equal(state.records.find(r => r.dtNo === 'SAP_823').ritaseNumber, 84, 'Reused handover did not restart at 084');
  const finalSnapshot = await db.snapshot();
  sessionStorage.setItem('reuseExpected', JSON.stringify({ session: state.session, records: finalSnapshot.records, imports: finalSnapshot.imports, masters: finalSnapshot.masters }));
  db.db.close();
  return 'PASS 83 BDM + 3 local UI saves → full reset → reuse NS 20/10/2026 at 084, empty checker → new UI save 084; scope/tombstone/audit/backup/rollback/ambiguity/stale writes verified';
})()
