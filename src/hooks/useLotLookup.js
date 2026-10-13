import { useEffect, useRef, useState } from 'react';
import { createLotCache, LOT_CACHE_AGE } from '../lib/lotCache.js';
import { applyLotLookup, hasLotConflict, lotId, lotLookupPatch } from '../lib/lotLookup.js';

export default function useLotLookup(samples, setSamples, enabled, scope) {
  const [states, setStates] = useState({});
  const cache = useRef(null);
  if (!cache.current) cache.current = createLotCache();
  const [catalog, setCatalog] = useState(() => ({ ...cache.current.info(), status: 'idle' }));
  const mounted = useRef(true);
  const active = useRef({ enabled, scope });
  active.current = { enabled, scope };
  const latest = useRef(samples), previous = useRef({ scope, ids: new Map() });
  const jobs = useRef(new Map());
  latest.current = samples;
  const cancel = key => {
    const job = jobs.current.get(key);
    if (job) { clearTimeout(job.timer); job.controller.abort(); jobs.current.delete(key); }
  };
  const stop = () => { for (const key of jobs.current.keys()) cancel(key); };
  const lookup = (key, id, delay = 0, force = false) => {
    cancel(key);
    const job = { controller: new AbortController() };
    jobs.current.set(key, job);
    setStates(current => ({ ...current, [key]: { id, status: 'loading' } }));
    job.timer = setTimeout(async () => {
      try {
        const response = await cache.current.lookup(id, job.controller.signal, force);
        if (jobs.current.get(key) !== job) return;
        const sample = latest.current.find(item => item.syncId === key && lotId(item.ositoId) === id);
        if (!sample) return;
        if (!response || response.id !== id || !['found', 'missing', 'ambiguous'].includes(response.status)) throw new Error('unavailable');
        if (response.status !== 'found') {
          setStates(current => ({ ...current, [key]: { id, status: response.status } }));
          return;
        }
        const patch = lotLookupPatch(response.lot);
        const conflict = hasLotConflict(sample, patch);
        setStates(current => ({ ...current, [key]: { id, patch, status: conflict ? 'review' : 'filled' } }));
        if (!conflict) setSamples(current => applyLotLookup(current, key, id, patch));
      } catch (error) {
        if (jobs.current.get(key) !== job || error.name === 'AbortError') return;
        setStates(current => ({ ...current, [key]: { id, status: error.message === 'offline' ? 'offline' : 'failed' } }));
      } finally { if (jobs.current.get(key) === job) jobs.current.delete(key); }
    }, delay);
  };

  useEffect(() => {
    const ids = new Map(samples.map(sample => [sample.syncId, lotId(sample.ositoId)]));
    if (!enabled || previous.current.scope !== scope) {
      stop();
      setStates({});
    } else {
      for (const [key, id] of ids) {
        if (!previous.current.ids.has(key) || previous.current.ids.get(key) === id) continue;
        cancel(key);
        setStates(current => ({ ...current, [key]: null }));
        if (id && id.length <= 64) lookup(key, id, cache.current.has(id) ? 250 : 650);
      }
      for (const key of jobs.current.keys()) if (!ids.has(key)) cancel(key);
    }
    previous.current = { scope, ids };
  }, [samples, enabled, scope]);
  useEffect(() => () => stop(), []);

  const refresh = async (manual = false) => {
    const requestedScope = active.current.scope;
    setCatalog(current => ({ ...current, status: 'loading' }));
    try {
      const info = await cache.current.refresh();
      if (!mounted.current) return;
      setCatalog({ ...info, status: info.persisted ? 'ready' : 'memory' });
      if (manual && active.current.enabled && active.current.scope === requestedScope) for (const sample of latest.current) {
        const id = lotId(sample.ositoId);
        if (id && id.length <= 64) lookup(sample.syncId, id);
      }
    } catch (error) {
      if (mounted.current) setCatalog(current => ({ ...current, status: error.message === 'offline' ? 'offline' : 'failed' }));
    }
  };
  useEffect(() => {
    mounted.current = true;
    const check = () => { if (navigator.onLine && !cache.current.fresh()) refresh(); };
    check();
    const timer = setInterval(check, LOT_CACHE_AGE);
    window.addEventListener('online', check);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('online', check); };
  }, []);

  return {
    states,
    catalog,
    refresh: () => refresh(true),
    retry: sample => lookup(sample.syncId, lotId(sample.ositoId), 0, true),
    dismiss: key => setStates(current => ({ ...current, [key]: null })),
    apply: (key, state) => {
      setSamples(current => applyLotLookup(current, key, state.id, state.patch, true));
      setStates(current => ({ ...current, [key]: { id: state.id, status: 'filled' } }));
    },
  };
}
