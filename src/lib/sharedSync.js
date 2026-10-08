// Public upload endpoint; authorization stays in Google Apps Script.
const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbyiZl-h9amh--1Rnw3JlEyjudA-flDAdrKORF17-1LPBlzo5mea48rYCaWYnSJO2q0JXw/exec';
export const SYNC_API_URL = (import.meta.env?.VITE_SYNC_API_URL || DEFAULT_SYNC_URL).replace(/\/$/, '');

export const readScriptResponse = (params, signal, endpoint = SYNC_API_URL) => new Promise((resolve, reject) => {
  const callback = `ositoSync${crypto.randomUUID().replace(/-/g, '')}`;
  const script = document.createElement('script');
  const cleanup = () => { clearTimeout(timeout); script.remove(); delete window[callback]; signal?.removeEventListener('abort', abort); };
  const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
  const timeout = setTimeout(() => { cleanup(); reject(new Error('sharedUnavailable')); }, 20000);
  window[callback] = value => {
    cleanup();
    if (value?.error) reject(new Error(['invalidSession', 'invalidAppData', 'missingColumns', 'duplicateRows', 'duplicateHeaders'].includes(value.error) ? 'sharedInvalidData' : value.error === 'sessionTooLarge' ? 'sharedTooLarge' : 'sharedUnavailable'));
    else resolve(value);
  };
  script.onerror = () => { cleanup(); reject(new Error('sharedUnavailable')); };
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener('abort', abort, { once: true });
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({ ...params, callback })) url.searchParams.set(key, value);
  script.src = url.href; script.referrerPolicy = 'no-referrer';
  document.head.appendChild(script);
});

const pause = (ms, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener('abort', abort, { once: true });
});

export const sessionChanges = (session, previousFingerprint) => {
  let previous;
  try { previous = JSON.parse(previousFingerprint || 'null'); } catch { previous = null; }
  const { samples, ...metadata } = session;
  const metadataKeys = ['syncId', 'name', 'startTime', 'date', 'lexiconMode'];
  const sameMetadata = previous && metadataKeys.every(key => previous[key] === session[key]);
  const prior = new Map((Array.isArray(previous?.samples) ? previous.samples : []).map((sample, index) => [sample.syncId, { sample, index }]));
  const changed = samples.filter((sample, index) => {
    const old = prior.get(sample.syncId);
    return !sameMetadata || !old || old.index !== index || JSON.stringify(old.sample) !== JSON.stringify(sample);
  });
  return { ...metadata, samples: changed, positions: Object.fromEntries(samples.map((sample, index) => [sample.syncId, index + 1])) };
};

export const saveSharedSessions = async (sessions, signal, fetcher = fetch, endpoint = SYNC_API_URL, reader = readScriptResponse) => {
  const requestId = crypto.randomUUID();
  const body = JSON.stringify({ requestId, sessions });
  if (new TextEncoder().encode(body).length > 1000000) throw new Error('sharedTooLarge');
  try {
    await fetcher(endpoint, { method: 'POST', mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(25000)]) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // A lost response can still mean the server saved it. Check the receipt.
  }
  // An opaque POST response is not proof of a save. Require a server receipt.
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await reader({ action: 'receipt', requestId }, signal, endpoint);
    if (Array.isArray(result.saved) && sessions.every(session => result.saved.includes(session.syncId))) return result;
    if (!result.pending) throw new Error('sharedUnavailable');
    await pause(1500, signal);
  }
  throw new Error('sharedUnavailable');
};
