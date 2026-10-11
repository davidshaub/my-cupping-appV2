export const normalizeSessionCode = value => {
  const raw = String(value || '').toUpperCase().replace(/[-\s]/g, '');
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(raw)) throw new Error('invalidSessionCode');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

export const validateRecalledSession = (value, code) => {
  if (value?.sharedRevision != null && (!Number.isSafeInteger(value.sharedRevision) || value.sharedRevision < 0)) throw new Error('sharedInvalidData');
  if (value?.sharedUpdatedAt != null && (typeof value.sharedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(value.sharedUpdatedAt)))) throw new Error('sharedInvalidData');
  if (!value || typeof value.syncId !== 'string' || !value.syncId || !Array.isArray(value.samples) || !value.samples.length || value.samples.length > 100) throw new Error('sharedInvalidData');
  const ids = new Set();
  for (const sample of value.samples) {
    if (!sample || typeof sample.syncId !== 'string' || ids.has(sample.syncId) || !sample.scores || !sample.notes) throw new Error('sharedInvalidData');
    ids.add(sample.syncId);
    if (['fragrance', 'cleanCup', 'sweetness', 'acidity', 'body', 'flavor', 'aftertaste', 'balance', 'consistency', 'overall', 'defects', 'correction'].some(key => !Number.isFinite(sample.scores[key])) || (sample.scores.aroma != null && !Number.isFinite(sample.scores.aroma))) throw new Error('sharedInvalidData');
    if (['fragAromaTags', 'inCupTags', 'negativeTags'].some(key => !Array.isArray(sample.notes[key]) || sample.notes[key].some(tag => typeof tag !== 'string'))) throw new Error('sharedInvalidData');
  }
  return { ...value, sessionCode: normalizeSessionCode(code), count: value.samples.length };
};
