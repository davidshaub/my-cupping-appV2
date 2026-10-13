export const lotId = value => String(value ?? '').trim();

export const lotLookupPatch = lot => {
  if (!lot || ['lotName', 'processing', 'country'].some(key => typeof lot[key] !== 'string')) throw new Error('invalidLotLookup');
  const patch = {};
  if (lot.lotName.trim()) patch.lotName = lot.lotName.trim();
  if (lot.country.trim()) patch.country = lot.country.trim();
  const processing = lot.processing.trim();
  if (processing) {
    const exact = ['Washed', 'Natural', 'Honey', 'Other'].find(option => option.toLowerCase() === processing.toLowerCase());
    patch.processing = exact || 'Other';
    patch.processingOther = exact ? '' : processing;
  }
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
