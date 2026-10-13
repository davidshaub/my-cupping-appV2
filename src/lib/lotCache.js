import { readScriptResponse } from './sharedSync.js';
import { lotLookupPatch } from './lotLookup.js';

export const LOT_CACHE_KEY = 'cupping_lot_catalog_v1';
export const LOT_CACHE_AGE = 60 * 60 * 1000;

const normalizeEntry = entry => {
  if (!entry || typeof entry.id !== 'string' || !entry.id || !['found', 'ambiguous'].includes(entry.status)) throw new Error('invalidLotLookup');
  if (entry.status === 'ambiguous') return { id: entry.id, status: 'ambiguous' };
  lotLookupPatch(entry.lot);
  return { id: entry.id, status: 'found', lot: { lotName: entry.lot.lotName, processing: entry.lot.processing, country: entry.lot.country } };
};

export function catalogIndex(rows) {
  if (!Array.isArray(rows) || rows.length > 50000) throw new Error('invalidLotLookup');
  const index = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 4 || row.some(value => typeof value !== 'string')) throw new Error('invalidLotLookup');
    const [id, lotName, processing, country] = row.map(value => value.trim());
    if (!id) continue;
    const entry = { id, status: 'found', lot: { lotName, processing, country } };
    const previous = index.get(id);
    index.set(id, previous && JSON.stringify(previous) !== JSON.stringify(entry) ? { id, status: 'ambiguous' } : entry);
  }
  return index;
}

export function createLotCache({ storage = localStorage, reader = readScriptResponse, now = Date.now, online = () => navigator.onLine } = {}) {
  let index = new Map(), refreshedAt = 0, pending = null, sequence = 0;
  const changes = new Map();
  try {
    const saved = JSON.parse(storage.getItem(LOT_CACHE_KEY));
    if (saved?.version === 1 && Array.isArray(saved.entries) && Number.isFinite(saved.refreshedAt)) {
      index = new Map(saved.entries.map(value => { const entry = normalizeEntry(value); return [entry.id, entry]; }));
      refreshedAt = saved.refreshedAt;
    }
  } catch { /* Missing or damaged caches can be rebuilt without touching sessions. */ }
  const persist = () => {
    try { storage.setItem(LOT_CACHE_KEY, JSON.stringify({ version: 1, refreshedAt, entries: [...index.values()] })); return true; }
    catch { return false; }
  };
  return {
    info: () => ({ refreshedAt, count: index.size }),
    fresh: () => refreshedAt > 0 && now() >= refreshedAt && now() - refreshedAt < LOT_CACHE_AGE,
    has: id => index.has(id),
    async lookup(id, signal, force = false) {
      if (!force && index.has(id)) return index.get(id);
      if (!online()) throw new Error('offline');
      const response = (await reader({ action: 'lookupLot', id }, signal, undefined, 45000)).lotLookup;
      if (!response || response.id !== id) throw new Error('invalidLotLookup');
      if (response.status === 'missing') {
        // Never cache misses: a lot may be added immediately after this request.
        if (index.delete(id)) { changes.set(id, ++sequence); persist(); }
        return { id, status: 'missing' };
      }
      const entry = normalizeEntry(response);
      index.set(id, entry);
      changes.set(id, ++sequence);
      persist();
      return entry;
    },
    refresh() {
      if (pending) return pending;
      if (!online()) return Promise.reject(new Error('offline'));
      const started = sequence;
      pending = (async () => {
        const response = await reader({ action: 'lotCatalog' }, undefined, undefined, 60000);
        const next = catalogIndex(response.lotCatalog);
        // A live miss lookup finishing during the catalog fetch is newer than that snapshot.
        for (const [id, changed] of changes) if (changed > started) {
          if (index.has(id)) next.set(id, index.get(id));
          else next.delete(id);
        }
        index = next;
        refreshedAt = now();
        changes.clear();
        return { refreshedAt, count: index.size, persisted: persist() };
      })().finally(() => { pending = null; });
      return pending;
    },
  };
}
