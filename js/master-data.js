import { nameKey, textError } from './validation.js';
export function mappingFromRecord(r, origin = 'handover') {
  return [
    { kind: 'stock', stockpile: r.stockpile, pileId: r.pileId, sourceCode: r.sourceCode, origin },
    { kind: 'product', productCode: r.productCode, dome: r.dome, destination: r.destination, origin }
  ];
}
export const mappingKey = m => JSON.stringify(m.kind === 'stock' ? [m.kind, m.stockpile, m.pileId, m.sourceCode] : [m.kind, m.productCode, m.dome, m.destination]);
export function mappingErrors(m) {
  if (!m || !['stock', 'product', 'scale', 'checker', 'shift'].includes(m.kind)) return ['Jenis master tidak valid.'];
  const keys = m.kind === 'stock' ? ['stockpile', 'pileId'] : m.kind === 'product' ? ['productCode', 'dome', 'destination'] : ['value'];
  if (m.kind === 'stock') for (const k of ['sourceCode','dome','destination']) if (m[k] !== undefined && m[k] !== '') keys.push(k);
  return keys.map(k => textError(m[k], k)).filter(Boolean);
}
export function conflicts(candidate, masters) {
  return masters.filter(m => m.active !== false && m.id !== candidate.id && m.kind === candidate.kind && (
    m.kind === 'stock' ? false :
    m.kind === 'product' ? nameKey(m.dome) === nameKey(candidate.dome) && nameKey(m.destination) === nameKey(candidate.destination) && m.productCode !== candidate.productCode : false
  ));
}
export function deriveMappings(records, masters) {
  const result = [], seen = new Set(masters.filter(m => m.active !== false).map(mappingKey));
  for (const r of records) for (const m of mappingFromRecord(r)) {
    const key = mappingKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...m, conflicts: conflicts(m, [...masters, ...result]) });
  }
  return result;
}

// Pair identity is independent of legacy Excel source metadata.
export const pairKey = m => JSON.stringify([nameKey(m.stockpile), nameKey(m.pileId)]);
export function stockPairs(masters) {
  const pairs = new Map();
  for (const m of masters.filter(m => m.kind === 'stock' && m.active !== false)) {
    const key = pairKey(m);
    if (!pairs.has(key)) pairs.set(key, m);
  }
  return [...pairs.values()].sort((a,b) => pairKey(a) < pairKey(b) ? -1 : pairKey(a) > pairKey(b) ? 1 : 0);
}
export function resolveProduct(dome, destination, masters) {
  const matches = masters.filter(m => m.kind === 'product' && m.active !== false && m.dome === dome && m.destination === destination);
  const codes = [...new Set(matches.map(m => m.productCode))];
  return codes.length === 1 ? matches[0] : null;
}
export function stockTarget(stock, masters, records, lastHandover = null) {
  const peers = masters.filter(m => m.kind === 'stock' && m.active !== false && pairKey(m) === pairKey(stock));
  const explicit = peers.filter(m => m.dome && m.destination);
  const targets = explicit.length ? explicit : peers.flatMap(m =>
    records.filter(r => pairKey(r) === pairKey(m) && r.origin === 'import' && (!(lastHandover || m.importId) || r.importId === (lastHandover || m.importId))));
  const unique = new Map(targets.map(t => [JSON.stringify([t.dome,t.destination]), {dome:t.dome,destination:t.destination}]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}
