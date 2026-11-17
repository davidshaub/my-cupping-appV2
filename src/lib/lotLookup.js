export const lotId = value => String(value ?? '').trim();

// Shared by any lookup source that returns a free-text processing value (Lot Summary, AirTable):
// this app only stores Washed/Natural/Honey/Other, with the original text kept in processingOther
// whenever the source's wording doesn't match one of those three exactly.
export const normalizeProcessingLookup = processing => {
  const trimmed = String(processing ?? '').trim();
  if (!trimmed) return {};
  const exact = ['Washed', 'Natural', 'Honey', 'Other'].find(option => option.toLowerCase() === trimmed.toLowerCase());
  return { processing: exact || 'Other', processingOther: exact ? '' : trimmed };
};

export const lotLookupPatch = lot => {
  if (!lot || ['lotName', 'processing', 'country'].some(key => typeof lot[key] !== 'string')) throw new Error('invalidLotLookup');
  const patch = {};
  if (lot.lotName.trim()) patch.lotName = lot.lotName.trim();
  if (lot.country.trim()) patch.country = lot.country.trim();
  Object.assign(patch, normalizeProcessingLookup(lot.processing));
  return patch;
};

export const hasLotConflict = (sample, patch) => Object.entries(patch).some(([key, value]) => {
  const existing = String(sample[key] ?? '').trim();
  return existing && !(key === 'processing' && existing === 'Select One') && existing !== value;
});

export const applyLotLookup = (samples, syncId, id, patch, replace = false) => samples.map(sample => {
  if (sample.syncId !== syncId || lotId(sample.ositoId) !== id || (!replace && hasLotConflict(sample, patch))) return sample;
  return { ...sample, ...patch };
});
