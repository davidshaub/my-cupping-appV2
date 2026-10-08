import { useEffect, useRef, useState } from 'react';
import { SYNC_API_URL, saveSharedSessions, sessionChanges } from '../lib/sharedSync.js';

const ACK_KEY = 'cupping_shared_sync_acknowledged_v1';
export const sessionFingerprint = session => JSON.stringify({ syncId: session.syncId, name: session.name, startTime: session.startTime, date: session.date, lexiconMode: session.lexiconMode, samples: session.samples });

export default function useGoogleSheets(history) {
  const [online, setOnline] = useState(navigator.onLine);
  const acknowledged = useRef(null), latest = useRef(history);
  const busy = useRef(false), timer = useRef(null), mounted = useRef(true);
  const retryAt = useRef(0), failures = useRef(0), lastUpload = useRef(0);
  const controller = useRef(null);
  if (!acknowledged.current) {
    try { const saved = JSON.parse(localStorage.getItem(ACK_KEY) || '{}'); acknowledged.current = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; }
    catch { acknowledged.current = {}; }
  }
  latest.current = history;
  const saveAcknowledged = () => localStorage.setItem(ACK_KEY, JSON.stringify(acknowledged.current));
  const dirty = () => latest.current.filter(entry => entry.samples.length && acknowledged.current[entry.syncId] !== sessionFingerprint(entry));

  const flush = async () => {
    if (busy.current || !SYNC_API_URL || !navigator.onLine || !mounted.current) return;
    const remaining = Math.max(retryAt.current, lastUpload.current + 30000) - Date.now();
    if (remaining > 0) { clearTimeout(timer.current); timer.current = setTimeout(flush, remaining); return; }
    if (!dirty().length) return;
    busy.current = true;
    controller.current = new AbortController();
    try {
      const batch = [], changes = [];
      let bytes = 0;
      for (const entry of dirty().slice(0, 20)) {
        const delta = sessionChanges(entry, acknowledged.current[entry.syncId]);
        const size = new TextEncoder().encode(JSON.stringify(delta)).length;
        if (batch.length && bytes + size > 750000) break;
        batch.push(entry); changes.push(delta); bytes += size;
      }
      if (batch.length) {
        if (changes.some(entry => entry.samples.length)) await saveSharedSessions(changes.filter(entry => entry.samples.length), controller.current.signal);
        lastUpload.current = Date.now();
        for (const entry of batch) acknowledged.current[entry.syncId] = sessionFingerprint(entry);
        saveAcknowledged();
      }
      failures.current = 0; retryAt.current = 0;
    } catch (failure) {
      if (!mounted.current || failure.name === 'AbortError') return;
      failures.current++;
      retryAt.current = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(failures.current - 1, 5));
    } finally {
      busy.current = false;
      if (mounted.current && SYNC_API_URL && navigator.onLine) {
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, Math.max(30000, retryAt.current - Date.now()));
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    const changeOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) { retryAt.current = 0; flush(); }
    };
    const visible = () => { if (document.visibilityState === 'visible') flush(); };
    window.addEventListener('online', changeOnline); window.addEventListener('offline', changeOnline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false; clearTimeout(timer.current); controller.current?.abort();
      window.removeEventListener('online', changeOnline); window.removeEventListener('offline', changeOnline);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  useEffect(() => {
    if (!online || !SYNC_API_URL) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 2000);
  }, [history, online]);

}
