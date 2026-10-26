export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const clone = value => structuredClone(value);
export const state = { records: [], masters: [], session: null, cache: null, checkerCache: null, checkerPending: null, pending: null, draft: null, ready: false, sessionTransition: false, view: 'setup' };
export const activeMasters = (kind) => state.masters.filter(m => m.kind === kind && m.active !== false);
