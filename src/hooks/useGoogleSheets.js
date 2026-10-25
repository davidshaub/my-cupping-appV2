import { useEffect, useRef, useState } from 'react';
import { SYNC_API_URL, saveSharedSessions, sessionChanges, sessionFingerprint, sessionSyncState, readScriptResponse } from '../lib/sharedSync.js';
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
  const dirty = () => latest.current.filter(entry => !entry.trimmed && !paused.current.has('*') && !paused.current.has(entry.syncId) && !blocked.current.has(entry.syncId) && entry.samples.length && sessionSyncState(entry, acknowledged.current[entry.syncId]) === 'dirty');

  // The server rejects an upload as 'sharedConflict' whenever the revision number it carries doesn't
  // match what's currently stored — including when THIS device's own previous upload actually saved
  // but the receipt confirmation that would have told us the new revision number never arrived (a
  // dropped connection, the tab backgrounding mid-poll, etc.). That isn't another device; it's this
  // device not knowing its own last write landed. Before treating it as a real conflict, fetch the
  // current remote copy and compare it against what we have, so a self-inflicted stale revision number
  // can be corrected automatically instead of permanently blocking every future sync for this session.
  const resolveConflict = async entry => {
    try {
      const result = await readScriptResponse({ action: 'recall', code: entry.sessionCode }, controller.current?.signal);
      if (result.protocol !== 2) return false;
      const remote = validateRecalledSession(result.session, entry.sessionCode);
      if (remote.syncId !== entry.syncId) return false;
      const remoteFingerprint = sessionFingerprint(remote);
      if (remoteFingerprint === sessionFingerprint(entry)) {
        // The remote copy already matches this device exactly — our earlier "failed" upload actually
        // went through. Nothing left to send; just adopt the revision so we stop retrying it.
        acknowledged.current[entry.syncId] = remoteFingerprint;
        saveAcknowledged();
        codesCallback.current?.({ [entry.syncId]: remote.sessionCode }, { [entry.syncId]: { sharedRevision: remote.sharedRevision, sharedUpdatedAt: remote.sharedUpdatedAt } });
        return true;
      }
      if (remoteFingerprint === acknowledged.current[entry.syncId]) {
        // The remote copy hasn't changed since our last confirmed sync, so our pending local edits are
        // genuinely new — not a real conflict, just a revision number we lost track of. Adopt the fresh
        // revision and let the normal retry pick this session back up with it.
        codesCallback.current?.({ [entry.syncId]: remote.sessionCode }, { [entry.syncId]: { sharedRevision: remote.sharedRevision, sharedUpdatedAt: remote.sharedUpdatedAt } });
        return true;
      }
      // The remote copy has content we don't recognize as our own — a genuine external change (or an
      // ambiguous partial landing). Don't guess: surface it so the person can choose what happens next.
      return false;
    } catch {
      return false;
    }
  };

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
      if (failure.message === 'sharedConflict') {
        const entry = latest.current.find(item => item.syncId === sendingId);
        const recovered = entry && (await resolveConflict(entry));
        if (!recovered) {
          blocked.current.add(sendingId);
          setConflicts(current => ({ ...current, [sendingId]: failure.message }));
        }
      } else if (failure.message === 'sharedUpgrade') {
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
    const visible = () => {
      if (document.visibilityState === 'visible') flush();
      // Closing the tab/app or switching away can cut off the usual 2s-after-typing delay.
      // Try to get pending edits out the door the moment the page starts going away.
      else flush();
    };
    window.addEventListener('online', changeOnline); window.addEventListener('offline', changeOnline);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pagehide', flush);
    return () => {
      mounted.current = false; clearTimeout(timer.current); controller.current?.abort();
      window.removeEventListener('online', changeOnline); window.removeEventListener('offline', changeOnline);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pagehide', flush);
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
      const state = sessionSyncState(session, acknowledged.current[session.syncId]);
      return { remote, dirty: state !== 'current', baselineKnown: state !== 'unknown' };
    } catch (error) {
      paused.current.delete(session.syncId);
      throw error;
    }
  };
  // The manual failsafe: overwrite the saved copy with exactly what's on this device, regardless of
  // what the server currently has. Fetches the current revision first so the write always lands (the
  // server only rejects a mismatched revision, never a specific content check), then sends the full
  // session — not a delta — so nothing from an earlier partial/unconfirmed upload can linger.
  const forcePush = async session => {
    if (!navigator.onLine) throw new Error('updateOffline');
    if (busy.current) throw new Error('updateBusy');
    paused.current.add(session.syncId);
    try {
      const result = await readScriptResponse({ action: 'recall', code: session.sessionCode });
      if (result.protocol !== 2) throw new Error('sharedUpgrade');
      const remote = validateRecalledSession(result.session, session.sessionCode);
      if (remote.syncId !== session.syncId) throw new Error('sharedInvalidData');
      const delta = { ...session, sharedRevision: remote.sharedRevision, positions: Object.fromEntries(session.samples.map((sample, index) => [sample.syncId, index + 1])) };
      const receipt = await saveSharedSessions([delta]);
      if (!receipt.versions?.[session.syncId]) throw new Error('sharedUpgrade');
      acknowledged.current[session.syncId] = sessionFingerprint(session);
      saveAcknowledged();
      blocked.current.delete(session.syncId);
      setConflicts(current => ({ ...current, [session.syncId]: null }));
      if (receipt.codes) codesCallback.current?.(receipt.codes, receipt.versions);
    } finally {
      paused.current.delete(session.syncId);
    }
  };
  const warnings = { ...conflicts };
  for (const entry of history) if (!entry.trimmed && entry.sessionCode && sessionSyncState(entry, acknowledged.current[entry.syncId]) === 'unknown') warnings[entry.syncId] = 'sharedBaselineMissing';
  return { conflicts: warnings, acceptRemote, checkRemote, forcePush, release: id => paused.current.delete(id), holdRecall: () => {
    if (busy.current) throw new Error('updateBusy');
    paused.current.add('*');
  }, isSynced: session => sessionSyncState(session, acknowledged.current[session.syncId]) === 'current' };
}
