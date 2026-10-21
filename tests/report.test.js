import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionReport } from '../js/wa-exporter.js';
const session = { operationDate: '2026-10-20', shift: 'DS', scale: 'BDM', checker: 'SESSION CHECKER', handoverConfirmed: true, handoverId: 'handover', activationId: 'activation', startNumber: 1, nextNumber: 6, nextRitase: '46315-006' };
const rows = ['S6B_40', 'S6B_40', 'L22_S06', 'S14_38', 'S6B_40'].map((pileId, i) => ({ ...session, id: `uuid-${i}`, origin: 'local', numberingSession: session.handoverId, ritaseNumber: i + 1, dtNo: 'SAP_820', sourceCode: '4', stockpile: 'TS_15', pileId, productCode: '1', dome: 'SCZ-1190', destination: 'ZHN LINE 26', time: `15.2${i}.59`, createdAt: '2026-10-20T00:00:00Z' }));
test('active activation report counts trips, isolates all scopes, and sorts piles deterministically', () => {
  const excluded = [{ scale: 'ONI' }, { shift: 'NS' }, { operationDate: '2026-10-21' }, { origin: 'import' }, { deletedAt: 'now', ritaseNumber: 99 }, { numberingSession: 'previous' }, { activationId: 'previous' }].map((change, i) => ({ ...rows[0], id: `excluded-${i}`, ritaseNumber: 99, ...change }));
  const original = structuredClone([...rows, ...excluded]);
  const report = sessionReport([...rows].reverse().concat(excluded), session);
  assert.equal(report.error, ''); assert.equal(report.total, 5);
  assert.deepEqual(report.piles, [{ pileId: 'S6B_40', count: 3 }, { pileId: 'L22_S06', count: 1 }, { pileId: 'S14_38', count: 1 }]);
  assert.equal(report.piles.reduce((n, p) => n + p.count, 0), 5);
  assert.equal(report.text.split('\n').length, 5);
  report.text.split('\n').forEach((line, i) => { const cols = line.split('\t'); assert.equal(cols.length, 11); assert.equal(cols[5], ''); assert.equal(cols[0], `46315-00${i+1}`); assert.equal(cols[9], `15.2${i}`); });
  assert.deepEqual([...rows, ...excluded], original);
});
test('pile correction and stored Option B renumbering are reflected without separate counters', () => {
  const corrected = structuredClone(rows); corrected[0].pileId = 'L22_S06';
  let report = sessionReport(corrected, session); assert.equal(report.error, ''); assert.equal(report.total, 5); assert.equal(report.piles.find(p => p.pileId === 'L22_S06').count, 2);
  corrected[4].time = '15.20.00'; corrected[4].ritaseNumber = 1;
  corrected.slice(0,4).forEach(r => r.ritaseNumber++);
  report = sessionReport(corrected, session); assert.equal(report.error, ''); assert.equal(report.records[0].id, rows[4].id); assert.ok(report.text.startsWith('46315-001'));
});
test('corrupt numbering, provenance, data, counter, chronology and frozen collisions block handover output', () => {
  const cases = [
    rs => delete rs[0].ritaseNumber, rs => rs[1].ritaseNumber = 1,
    rs => rs[4].ritaseNumber = 7, rs => rs.pop(), rs => rs[0].pileId = '',
    rs => rs[0].destination = 'bad\tdata', rs => rs[0].time = '23.60',
    rs => delete rs[0].numberingSession, rs => delete rs[0].activationId,
    rs => rs[0].id = rs[1].id, rs => rs[0].time = '23.59.59',
    rs => rs.push({ ...rs[0], id: 'history-collision', origin: 'import' }),
    rs => rs.push({ ...rs[0], id: 'old-collision', activationId: 'old' })
  ];
  for (const change of cases) { const rs = structuredClone(rows); change(rs); const report = sessionReport(rs, session); assert.ok(report.error); assert.equal(report.text, ''); }
  for (const change of [{ startNumber: undefined }, { nextNumber: 7 }, { nextRitase: '46315-007' }, { handoverConfirmed: false }, { shift: 'Other' }]) assert.ok(sessionReport(rows, { ...session, ...change }).error);
});
test('no session never leaks history, empty active session totals zero, reload is deterministic', () => {
  assert.deepEqual(sessionReport(rows, null), { session: null, records: [], piles: [], total: 0, text: '', error: '' });
  const empty = sessionReport([], { ...session, startNumber: undefined, nextNumber: 1, nextRitase: '46315-001' });
  assert.equal(empty.total, 0); assert.equal(empty.text, ''); assert.equal(empty.error, '');
  assert.deepEqual(sessionReport(structuredClone(rows), structuredClone(session)), sessionReport(rows, session));
});

test('NS midnight and numbers above 999 use frozen suffixes without changing operation date', () => {
  const ns = { ...session, shift: 'NS', startNumber: 999, nextNumber: 1001, nextRitase: '46315-1001' };
  const rs = [{ ...rows[0], shift: 'NS', ritaseNumber: 999, time: '23.59.59', actualDate: '2026-10-20' }, { ...rows[1], shift: 'NS', ritaseNumber: 1000, time: '00.00.59', actualDate: '2026-10-21' }];
  const report = sessionReport(rs, ns); assert.equal(report.error, '');
  assert.ok(report.text.startsWith('46315-999')); assert.ok(report.text.split('\n')[1].startsWith('46315-1000'));
  assert.equal(report.text.split('\n')[0].split('\t')[9], '23.59'); assert.equal(report.text.split('\n')[1].split('\t')[9], '00.00');
  delete rs[0].actualDate; assert.match(sessionReport(rs, ns).error, /OD-10/);
});
