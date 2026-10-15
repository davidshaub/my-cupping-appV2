import { calculateTotal, initializeSamples } from './cupping.js';
import { canonicalTag } from './lexicon.js';
import { readScriptResponse, SYNC_API_URL } from './sharedSync.js';

export const CUPPER_KEY = 'osito_cupper';
export const getCupper = () => localStorage.getItem(CUPPER_KEY) || '';
export const setCupper = name => localStorage.setItem(CUPPER_KEY, name.trim().slice(0, 80));
export const normalizeInviteCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const tokenFor = (kind, code) => {
  const key = `osito_${kind}_${normalizeInviteCode(code)}`;
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
};
export const hostTokenFor = code => localStorage.getItem(`osito_host_${normalizeInviteCode(code)}`) || '';
export const invitationUrl = code => { const url = new URL(location.href); url.hash = `shared=${encodeURIComponent(code)}`; return url.href; };
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
  try { await fetcher(SYNC_API_URL, { method:'POST', mode:'no-cors', credentials:'omit', headers:{'Content-Type':'text/plain;charset=utf-8'}, body, signal: signal || AbortSignal.timeout(25000) }); }
  catch(error) { if (signal?.aborted) throw error; }
  for (let attempt=0;attempt<10;attempt++) {
    const receipt = await reader({ action:'receipt', requestId }, signal);
    if (receipt.collaborationError) throw new Error(receipt.collaborationError);
    if (receipt.collaboration) return receipt.collaboration;
    if (!receipt.pending) throw new Error('Update the Google Apps Script deployment to enable shared cuppings.');
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
  throw new Error('No save confirmation received. Your draft is retained; check the connection and retry.');
}
export const readSharedReport = (code, signal) => readScriptResponse({ action:'sharedReport', code, guestToken:tokenFor('guest',code), hostToken:hostTokenFor(code) },signal);
