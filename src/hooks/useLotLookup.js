import { useEffect, useRef, useState } from 'react';
import { readScriptResponse } from '../lib/sharedSync.js';
import { applyLotLookup, hasLotConflict, lotId, lotLookupPatch } from '../lib/lotLookup.js';

export default function useLotLookup(samples, setSamples, enabled, scope) {
  const [states, setStates] = useState({});
  const latest = useRef(samples), previous = useRef({ scope, ids: new Map() });
  const jobs = useRef(new Map());
  latest.current = samples;
  const cancel = key => {
    const job = jobs.current.get(key);
    if (job) { clearTimeout(job.timer); job.controller.abort(); jobs.current.delete(key); }
  };
  const stop = () => { for (const key of jobs.current.keys()) cancel(key); };
  const lookup = (key, id, delay = 0) => {
    cancel(key);
    const job = { controller: new AbortController() };
    jobs.current.set(key, job);
    setStates(current => ({ ...current, [key]: { id, status: 'loading' } }));
    job.timer = setTimeout(async () => {
      try {
        if (!navigator.onLine) throw new Error('offline');
        const result = await readScriptResponse({ action: 'lookupLot', id }, job.controller.signal);
        if (jobs.current.get(key) !== job) return;
        const sample = latest.current.find(item => item.syncId === key && lotId(item.ositoId) === id);
        if (!sample) return;
        const response = result.lotLookup;
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
        if (id && id.length <= 64) lookup(key, id, 650);
      }
      for (const key of jobs.current.keys()) if (!ids.has(key)) cancel(key);
    }
    previous.current = { scope, ids };
  }, [samples, enabled, scope]);
  useEffect(() => () => stop(), []);

  return {
    states,
    retry: sample => lookup(sample.syncId, lotId(sample.ositoId)),
    dismiss: key => setStates(current => ({ ...current, [key]: null })),
    apply: (key, state) => {
      setSamples(current => applyLotLookup(current, key, state.id, state.patch, true));
      setStates(current => ({ ...current, [key]: { id: state.id, status: 'filled' } }));
    },
  };
}
