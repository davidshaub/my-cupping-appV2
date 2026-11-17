import { useEffect, useRef, useState } from 'react';
import { readScriptResponse } from '../lib/sharedSync.js';
import { applySampleLookup, hasSampleLookupConflict, labSampleId, sampleLookupPatch } from '../lib/sampleLookup.js';

// Unlike the Lot Summary lookup, the AirTable sample table has thousands of rows and keeps growing,
// so there's no bulk catalog to prefetch here - every lookup is a live, per-ID network call.
export default function useSampleLookup(samples, setSamples, enabled, scope) {
  const [states, setStates] = useState({});
  const mounted = useRef(true);
  const active = useRef({ enabled, scope });
  active.current = { enabled, scope };
  const latest = useRef(samples), previous = useRef({ scope, ids: new Map() });
  const jobs = useRef(new Map());
  const edited = useRef(new Set());
  const statesRef = useRef({});
  latest.current = samples;
  statesRef.current = states;
  const cancel = key => {
    const job = jobs.current.get(key);
    if (job) { clearTimeout(job.timer); job.controller.abort(); jobs.current.delete(key); }
  };
  const stop = () => { for (const key of jobs.current.keys()) cancel(key); };
  const lookup = (key, id, delay = 0) => {
    edited.current.delete(key);
    cancel(key);
    const job = { controller: new AbortController(), id };
    jobs.current.set(key, job);
    setStates(current => ({ ...current, [key]: { id, status: 'loading' } }));
    job.timer = setTimeout(async () => {
      try {
        if (!navigator.onLine) throw new Error('offline');
        const response = (await readScriptResponse({ action: 'lookupSample', id }, job.controller.signal, undefined, 45000)).sampleLookup;
        if (jobs.current.get(key) !== job) return;
        const sample = latest.current.find(item => item.syncId === key && labSampleId(item.labSampleId) === id);
        if (!sample) return;
        if (!response || response.id !== id || !['found', 'missing', 'ambiguous'].includes(response.status)) throw new Error('unavailable');
        if (response.status !== 'found') {
          setStates(current => ({ ...current, [key]: { id, status: response.status } }));
          return;
        }
        const patch = sampleLookupPatch(response.sample);
        const conflict = hasSampleLookupConflict(sample, patch);
        setStates(current => ({ ...current, [key]: { id, patch, status: conflict ? 'review' : 'filled' } }));
        if (!conflict) setSamples(current => applySampleLookup(current, key, id, patch));
      } catch (error) {
        if (jobs.current.get(key) !== job || error.name === 'AbortError') return;
        const status = error.message === 'offline' ? 'offline' : error.message === 'airtableNotConfigured' ? 'notConfigured' : 'failed';
        setStates(current => ({ ...current, [key]: { id, status } }));
      } finally { if (jobs.current.get(key) === job) jobs.current.delete(key); }
    }, delay);
  };

  useEffect(() => {
    const ids = new Map(samples.map(sample => [sample.syncId, labSampleId(sample.labSampleId)]));
    if (!enabled || previous.current.scope !== scope) {
      stop();
      edited.current.clear();
      setStates({});
    } else {
      for (const [key, id] of ids) {
        if (!previous.current.ids.has(key) || previous.current.ids.get(key) === id) continue;
        const activeJob = jobs.current.get(key);
        if (activeJob && activeJob.id === id) continue;
        cancel(key);
        setStates(current => ({ ...current, [key]: null }));
        if (id && /^\d{1,15}$/.test(id)) edited.current.add(key);
        else edited.current.delete(key);
      }
      for (const key of jobs.current.keys()) if (!ids.has(key)) cancel(key);
    }
    previous.current = { scope, ids };
  }, [samples, enabled, scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  useEffect(() => {
    // Reconnecting retries any lookup that failed only because this device was offline when it
    // ran - the person shouldn't have to notice and tap retry themselves.
    const retryOffline = () => {
      if (!active.current.enabled) return;
      for (const sample of latest.current) {
        const state = statesRef.current[sample.syncId];
        if (state?.status === 'offline' && state.id === labSampleId(sample.labSampleId)) lookup(sample.syncId, state.id, 0);
      }
    };
    window.addEventListener('online', retryOffline);
    return () => window.removeEventListener('online', retryOffline);
  }, []);

  return {
    states,
    commit: () => {
      if (!active.current.enabled) return;
      for (const sample of latest.current) {
        if (edited.current.has(sample.syncId)) lookup(sample.syncId, labSampleId(sample.labSampleId));
      }
    },
    // Pasting a column of IDs writes straight into samples without a later "leave the field" moment
    // for commit() to catch - call this right after a paste that touched the Sample ID column.
    lookupPasted: pastedSamples => {
      if (!active.current.enabled) return;
      for (const sample of pastedSamples) {
        const id = labSampleId(sample.labSampleId);
        if (id && /^\d{1,15}$/.test(id)) lookup(sample.syncId, id);
      }
    },
    retry: sample => lookup(sample.syncId, labSampleId(sample.labSampleId), 0),
    dismiss: key => setStates(current => ({ ...current, [key]: null })),
    apply: (key, state) => {
      setSamples(current => applySampleLookup(current, key, state.id, state.patch, true));
      setStates(current => ({ ...current, [key]: { id: state.id, status: 'filled' } }));
    },
  };
}
