import { sharedInvitationUrl } from './sharedLink.js';
import { calculateTotal, initializeSamples } from './cupping.js';
import { canonicalTag } from './lexicon.js';
import { readScriptResponse, SYNC_API_URL } from './sharedSync.js';

export const CUPPER_KEY = 'osito_cupper';
export const getCupper = () => localStorage.getItem(CUPPER_KEY) || '';
export const setCupper = name => localStorage.setItem(CUPPER_KEY, name.trim().slice(0, 80));
export const CHIMES_ENABLED_KEY = 'osito_chimes_enabled';
export const getChimesEnabled = () => localStorage.getItem(CHIMES_ENABLED_KEY) !== 'off';
export const setChimesEnabled = enabled => localStorage.setItem(CHIMES_ENABLED_KEY, enabled ? 'on' : 'off');
// Internal-team extras (Sample ID field, AirTable push). Off by default for the general public;
// turning it on requires the Panel Report password, but the on/off state itself is then remembered
// on this device like any other setting - turning it off never needs the password again, only
// turning it back on from off does, matching how Panel Report access itself always re-checks.
export const OSITO_MODE_KEY = 'osito_mode_enabled';
export const OSITO_PASSWORD_KEY = 'osito_mode_password';
export const getOsitoMode = () => localStorage.getItem(OSITO_MODE_KEY) === 'on';
// The password is remembered on this device (like the cupper name) for as long as Osito Mode is on,
// so password-gated actions like Push to AirTable never re-prompt - and cleared the moment Osito Mode
// is turned off, so switching it off really does remove the access from this device.
export const getOsitoPassword = () => localStorage.getItem(OSITO_PASSWORD_KEY) || null;
export const setOsitoPassword = password => password ? localStorage.setItem(OSITO_PASSWORD_KEY, password) : localStorage.removeItem(OSITO_PASSWORD_KEY);
export const setOsitoMode = enabled => {
  localStorage.setItem(OSITO_MODE_KEY, enabled ? 'on' : 'off');
  if (!enabled) setOsitoPassword(null);
};
export const DEFAULT_READY_MINUTES = 18;
export const READY_MINUTES_KEY = 'osito_ready_minutes';
export const getReadyMinutes = () => {
  const stored = Number.parseInt(localStorage.getItem(READY_MINUTES_KEY), 10);
  return Number.isInteger(stored) && stored >= 1 && stored <= 99 ? stored : DEFAULT_READY_MINUTES;
};
export const setReadyMinutes = minutes => localStorage.setItem(READY_MINUTES_KEY, String(Math.min(99, Math.max(1, Math.round(minutes)))));
export const normalizeInviteCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const tokenFor = (kind, code) => {
  const key = `osito_${kind}_${normalizeInviteCode(code)}`;
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
};
export const hostTokenFor = code => localStorage.getItem(`osito_host_${normalizeInviteCode(code)}`) || '';
export const invitationUrl = code => sharedInvitationUrl(location.href,code);
export const emptyContribution = mode => {
  const sample = initializeSamples(1)[0];
  return { cupper: getCupper(), mode, quickScore: '', noScore: false, scores: sample.scores, notes: sample.notes };
};
export const evaluationScore = evaluation => {
  if (evaluation.noScore && evaluation.mode !== 'quick') return null;
  if (evaluation.mode === 'quick') return evaluation.quickScore === '' || evaluation.quickScore == null ? null : Number(evaluation.quickScore);
  return Number(calculateTotal({ scores: evaluation.scores }));
};
export const notesFields = [['fragAromaTags', 'Fragrance/Aroma'], ['inCupTags', 'In the Cup'], ['negativeTags', 'Negative']];
export const aggregateEvaluations = evaluations => {
  const scores = evaluations.map(evaluationScore).filter(value => value != null && Number.isFinite(value));
  const notes = { otherText: '' }, counts = {};
  notesFields.forEach(([key]) => {
    const tally = new Map();
    evaluations.forEach(e => {
      const seen = new Set();
      (e.notes?.[key] || []).forEach(tag => { const canonical = canonicalTag(tag); if (seen.has(canonical)) return; seen.add(canonical); const old = tally.get(canonical); tally.set(canonical, { tag: old?.tag || tag, count: (old?.count || 0) + 1 }); });
    });
    counts[key] = [...tally.values()].sort((a,b)=>b.count-a.count || a.tag.localeCompare(b.tag));
    notes[key] = counts[key].map(item=>item.tag);
  });
  const complete = evaluations.length > 0 && evaluations.every(e => e.mode === 'full' && !e.noScore && e.scores);
  const attributes = complete ? Object.fromEntries(Object.keys(evaluations[0].scores).map(key => [key, evaluations.reduce((sum,e)=>sum+(key==='aroma' ? e.scores.aroma ?? e.scores.fragrance : e.scores[key]),0)/evaluations.length])) : null;
  return { notes, counts, attributes, score: scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null, scoreCount: scores.length, contributorCount: evaluations.length };
};
export const asPanelEvaluation = record => record.source === 'shared' ? record : { ...record, mode: 'full', scores: record.sample.scores, notes: record.sample.notes, noScore: record.sample.noScore };

export async function collaborationRequest(action, data, { signal, fetcher = fetch, reader = readScriptResponse } = {}) {
  const requestId = data.requestId || crypto.randomUUID();
  const body = JSON.stringify({ protocol: 'collaboration-v1', requestId, action, ...data });
  if (new TextEncoder().encode(body).length > 900000) throw new Error('This request is too large. Select fewer coffees.');
  const post = fetcher(SYNC_API_URL, { method:'POST', mode:'no-cors', credentials:'omit', headers:{'Content-Type':'text/plain;charset=utf-8'}, body, signal: signal || AbortSignal.timeout(25000) }).catch(()=>undefined);
  // Google's response redirect can outlast the actual write. Check receipts while it completes.
  await Promise.race([post,new Promise(resolve=>setTimeout(resolve,500))]);
  for (let attempt=0;attempt<10;attempt++) {
    const receipt = await reader({ action:'receipt', requestId }, signal);
    if (receipt.collaborationError) { const error=new Error(receipt.collaborationError);error.serverRejected=true;throw error; }
    if (receipt.collaboration) return receipt.collaboration;
    if (!receipt.pending) throw new Error('Update the Google Apps Script deployment to enable shared cuppings.');
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
  throw new Error('No save confirmation received. Your draft is retained; check the connection and retry.');
}
export const readSharedReport = (code, signal) => readScriptResponse({ action:'sharedReport', code, guestToken:tokenFor('guest',code), hostToken:hostTokenFor(code) },signal);
