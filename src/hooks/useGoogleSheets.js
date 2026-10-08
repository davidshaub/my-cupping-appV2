import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, SHEETS_SCOPE, loadGoogleIdentity, syncSessionToSheet, recallSheetSessions } from '../lib/googleSheets.js';

const ACK_KEY = 'cupping_sheet_acknowledged_v1';
export const sessionFingerprint = session => JSON.stringify({ syncId: session.syncId, name: session.name, startTime: session.startTime, date: session.date, lexiconMode: session.lexiconMode, samples: session.samples });

export default function useGoogleSheets(history, onRecall) {
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const hadConnection = useRef(false);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('googleDisconnected');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const client = useRef(null), credential = useRef(null), pending = useRef(new Map());
  const timer = useRef(null), expiryTimer = useRef(null), busy = useRef(false), mounted = useRef(true);
  const latest = useRef(history), recallCallback = useRef(onRecall), needsRecall = useRef(false);
  const acknowledged = useRef(null);
  if (!acknowledged.current) {
    try { const saved = JSON.parse(localStorage.getItem(ACK_KEY) || '{}'); acknowledged.current = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; } catch { acknowledged.current = {}; }
  }
  latest.current = history; recallCallback.current = onRecall;
  const saveAcknowledged = () => localStorage.setItem(ACK_KEY, JSON.stringify(acknowledged.current));

  const flush = async () => {
    if (busy.current || !credential.current || !navigator.onLine || (!pending.current.size && !needsRecall.current)) return;
    busy.current = true;
    const auth = credential.current;
    setStatus('googleSyncing'); setError('');
    try {
      while (pending.current.size && credential.current === auth) {
        const [id, entry] = pending.current.entries().next().value;
        await syncSessionToSheet(entry, { ...auth, isCurrent: () => mounted.current && credential.current === auth });
        acknowledged.current[id] = sessionFingerprint(entry);
        saveAcknowledged();
        // A newer version may have arrived during the request. Send it next.
        if (pending.current.get(id) === entry) pending.current.delete(id);
      }
      if (needsRecall.current && credential.current === auth) {
        const remote = await recallSheetSessions({ ...auth, isCurrent: () => mounted.current && credential.current === auth });
        if (credential.current !== auth || !mounted.current) return;
        // Pending local edits win; clean sessions can be restored from the sheet.
        const local = latest.current;
        const merged = [...local];
        for (const entry of remote) {
          const index = local.findIndex(item => item.syncId === entry.syncId);
          if (index >= 0 && acknowledged.current[entry.syncId] !== sessionFingerprint(local[index])) continue;
          const restored = index >= 0 ? { ...entry, id: local[index].id } : entry;
          acknowledged.current[restored.syncId] = sessionFingerprint(restored);
          if (index >= 0) merged[index] = restored; else merged.push(restored);
        }
        saveAcknowledged();
        recallCallback.current(merged);
        needsRecall.current = false;
      }
      if (mounted.current && credential.current === auth) setStatus('googleSynced');
    } catch (failure) {
      if (mounted.current && credential.current === auth) {
        const key = failure.message?.startsWith('google') ? failure.message : 'googleNetworkError';
        setError(key); setStatus(navigator.onLine ? 'googleSyncFailed' : 'googleOffline');
        if (['googleNetworkError', 'googleQuotaError'].includes(key)) { clearTimeout(timer.current); timer.current = setTimeout(flush, 30000); }
        if (key === 'googleReconnect') { credential.current = null; setConnected(false); }
      }
    } finally {
      busy.current = false;
      if (mounted.current && credential.current && credential.current !== auth) timer.current = setTimeout(flush, 2000);
    }
  };

  const prepare = () => {
    setError('');
    loadGoogleIdentity().then(oauth => {
      if (!mounted.current) return;
      client.current = oauth.initTokenClient({
        client_id: GOOGLE_CLIENT_ID, scope: SHEETS_SCOPE,
        callback: response => {
          if (!mounted.current) return;
          if (response.error || !response.access_token || !oauth.hasGrantedAllScopes(response, SHEETS_SCOPE)) {
            setError('googleAuthError'); setStatus('googleDisconnected'); return;
          }
          const auth = { token: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 - 30000 };
          credential.current = auth; hadConnection.current = true;
          clearTimeout(expiryTimer.current);
          expiryTimer.current = setTimeout(() => {
            if (credential.current !== auth || !mounted.current) return;
            credential.current = null; setConnected(false); setStatus('googleReconnect');
          }, Math.max(0, auth.expiresAt - Date.now()));
          needsRecall.current = true;
          setConnected(true); setStatus('googleConnected'); setError(''); setRevision(value => value + 1);
        },
        error_callback: () => { if (mounted.current) { setError('googlePopupError'); setStatus('googleDisconnected'); } }
      });
      setReady(true);
    }).catch(() => { if (mounted.current) { setReady(false); setError('googleLoadError'); } });
  };

  useEffect(() => {
    mounted.current = true;
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => { if (mounted.current) setOfflineReady(true); });
    if (navigator.onLine) prepare(); else setStatus('googleOffline');
    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && !client.current) prepare();
    };
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline);
      mounted.current = false; credential.current = null;
      clearTimeout(timer.current); clearTimeout(expiryTimer.current);
    };
  }, []);

  useEffect(() => {
    const ids = new Set(history.map(entry => entry.syncId));
    for (const id of pending.current.keys()) if (!ids.has(id)) pending.current.delete(id);
    for (const entry of history) {
      if (entry.samples.length && acknowledged.current[entry.syncId] !== sessionFingerprint(entry)) pending.current.set(entry.syncId, entry);
    }
    clearTimeout(timer.current);
    if (!online) { setStatus('googleOffline'); return; }
    if (!connected) { setStatus(hadConnection.current ? 'googleReconnect' : 'googleDisconnected'); return; }
    setStatus(pending.current.size ? 'googlePending' : needsRecall.current ? 'googleConnected' : 'googleSynced');
    timer.current = setTimeout(flush, 2000);
  }, [history, connected, online, revision]);

  const connect = () => {
    if (!ready) { prepare(); return; }
    setError(''); setStatus('googleConnecting');
    client.current.requestAccessToken({ prompt: '' });
  };
  const disconnect = () => {
    const token = credential.current?.token;
    credential.current = null; hadConnection.current = false; pending.current.clear();
    clearTimeout(timer.current); clearTimeout(expiryTimer.current);
    setConnected(false); setStatus('googleDisconnected'); setError('');
    if (token) window.google.accounts.oauth2.revoke(token, () => {});
  };
  const retry = () => {
    for (const entry of latest.current) if (acknowledged.current[entry.syncId] !== sessionFingerprint(entry)) pending.current.set(entry.syncId, entry);
    needsRecall.current = true;
    clearTimeout(timer.current); flush();
  };
  return { ready, offlineReady, online, connected, status, error, connect, disconnect, retry };
}
