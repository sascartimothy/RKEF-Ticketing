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
  const keys = m.kind === 'stock' ? ['stockpile', 'pileId'] : m.kind === 'product' ? ['dome', 'destination'] : ['value'];
  if (m.kind === 'product' && m.productCode !== undefined && m.productCode !== '') keys.push('productCode');
  if (m.kind === 'stock') for (const k of ['sourceCode','dome','destination']) if (m[k] !== undefined && m[k] !== '') keys.push(k);
  return keys.map(k => textError(m[k], k === 'dome' ? 'Product Code' : k)).filter(Boolean);
}
// Kept for import/API compatibility. Different legacy numeric column-7 values
// no longer conflict: active material identity is the column-8/Destination pair.
export function conflicts(_candidate, _masters) { return []; }
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
  return matches[0] || null; // Legacy column 7 does not determine the active pair.
}
export function stockTarget(stock, masters, records, lastHandover = null) {
  const peers = masters.filter(m => m.kind === 'stock' && m.active !== false && pairKey(m) === pairKey(stock));
  const explicit = peers.filter(m => m.dome && m.destination);
  const targets = explicit.length ? explicit : peers.flatMap(m =>
    records.filter(r => pairKey(r) === pairKey(m) && r.origin === 'import' && (!(lastHandover || m.importId) || r.importId === (lastHandover || m.importId))));
  const unique = new Map(targets.map(t => [JSON.stringify([t.dome,t.destination]), {dome:t.dome,destination:t.destination}]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export const productPairKey = m => JSON.stringify([nameKey(m.dome), nameKey(m.destination)]);
export function productPairs(masters) {
  const pairs = new Map();
  for (const m of masters.filter(m => m.kind === 'product' && m.active !== false)) if (!pairs.has(productPairKey(m))) pairs.set(productPairKey(m),m);
  return [...pairs.values()].sort((a,b) => productPairKey(a).localeCompare(productPairKey(b)));
}
