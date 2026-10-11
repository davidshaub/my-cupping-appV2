import { useEffect, useRef, useState } from 'react';
import { SYNC_API_URL, saveSharedSessions, sessionChanges, sessionFingerprint, readScriptResponse } from '../lib/sharedSync.js';
import { validateRecalledSession } from '../lib/sessionRecall.js';

const ACK_KEY = 'cupping_shared_sync_acknowledged_v1';
export { sessionFingerprint } from '../lib/sharedSync.js';

export default function useGoogleSheets(history, onCodes) {
  const codesCallback = useRef(onCodes);
  codesCallback.current = onCodes;
  const [online, setOnline] = useState(navigator.onLine);
  const [conflicts, setConflicts] = useState({});
  const blocked = useRef(new Set()), paused = useRef(new Set());
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
  const dirty = () => latest.current.filter(entry => !paused.current.has('*') && !paused.current.has(entry.syncId) && !blocked.current.has(entry.syncId) && (!entry.sessionCode || Number.isSafeInteger(entry.sharedRevision)) && entry.samples.length && (!entry.sessionCode || acknowledged.current[entry.syncId] !== sessionFingerprint(entry)));

  const flush = async () => {
    if (busy.current || !SYNC_API_URL || !navigator.onLine || !mounted.current) return;
    const remaining = Math.max(retryAt.current, lastUpload.current + 30000) - Date.now();
    if (remaining > 0) { clearTimeout(timer.current); timer.current = setTimeout(flush, remaining); return; }
    if (!dirty().length) return;
    busy.current = true;
    controller.current = new AbortController();
    let sendingId;
    try {
      const batch = [], changes = [];
      let bytes = 0;
      for (const entry of dirty().slice(0, 1)) {
        sendingId = entry.syncId;
        const delta = sessionChanges(entry, entry.sessionCode ? acknowledged.current[entry.syncId] : null);
        const size = new TextEncoder().encode(JSON.stringify(delta)).length;
        if (batch.length && bytes + size > 750000) break;
        batch.push(entry); changes.push(delta); bytes += size;
      }
      if (batch.length) {
        if (changes.some(entry => entry.samples.length)) {
          const receipt = await saveSharedSessions(changes.filter(entry => entry.samples.length), controller.current.signal);
          if (!receipt.versions?.[sendingId]) throw new Error('sharedUpgrade');
          if (receipt.codes) codesCallback.current?.(receipt.codes, receipt.versions);
        }
        lastUpload.current = Date.now();
        for (const entry of batch) acknowledged.current[entry.syncId] = sessionFingerprint(entry);
        saveAcknowledged();
      }
      failures.current = 0; retryAt.current = 0;
    } catch (failure) {
      if (!mounted.current || failure.name === 'AbortError') return;
      if (failure.message === 'sharedConflict' || failure.message === 'sharedUpgrade') {
        blocked.current.add(sendingId);
        setConflicts(current => ({ ...current, [sendingId]: failure.message }));
      }
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

  const acceptRemote = session => {
    acknowledged.current[session.syncId] = sessionFingerprint(session);
    saveAcknowledged();
    blocked.current.delete(session.syncId);
    setConflicts(current => ({ ...current, [session.syncId]: null }));
  };
  const checkRemote = async session => {
    if (!navigator.onLine) throw new Error('updateOffline');
    if (busy.current) throw new Error('updateBusy');
    paused.current.add(session.syncId);
    try {
      const result = await readScriptResponse({ action: 'recall', code: session.sessionCode });
      if (result.protocol !== 2) throw new Error('sharedUpgrade');
      const remote = validateRecalledSession(result.session, session.sessionCode);
      if (remote.syncId !== session.syncId || !Number.isSafeInteger(remote.sharedRevision) || remote.sharedRevision < (session.sharedRevision || 0)) throw new Error('sharedInvalidData');
      return { remote, dirty: acknowledged.current[session.syncId] !== sessionFingerprint(session) };
    } catch (error) {
      paused.current.delete(session.syncId);
      throw error;
    }
  };
  return { conflicts, acceptRemote, checkRemote, release: id => paused.current.delete(id), holdRecall: () => {
    if (busy.current) throw new Error('updateBusy');
    paused.current.add('*');
  } };
}
