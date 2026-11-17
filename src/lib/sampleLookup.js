import { formatMoisture, formatWaterActivity } from './cupping.js';
import { normalizeProcessingLookup } from './lotLookup.js';

export const labSampleId = value => String(value ?? '').trim();

export const sampleLookupPatch = sample => {
  if (!sample) throw new Error('invalidSampleLookup');
  const patch = {};
  if (typeof sample.ositoId === 'string' && sample.ositoId.trim()) patch.ositoId = sample.ositoId.trim();
  if (typeof sample.lotName === 'string' && sample.lotName.trim()) patch.lotName = sample.lotName.trim();
  if (typeof sample.country === 'string' && sample.country.trim()) patch.country = sample.country.trim();
  if (typeof sample.roastId === 'string' && sample.roastId.trim()) patch.roastId = sample.roastId.trim();
  if (typeof sample.sampleType === 'string' && sample.sampleType.trim()) patch.sampleType = sample.sampleType.trim();
  if (typeof sample.processing === 'string') Object.assign(patch, normalizeProcessingLookup(sample.processing));
  if (typeof sample.moisture === 'string' && sample.moisture.trim()) patch.moisture = formatMoisture(sample.moisture);
  if (typeof sample.waterActivity === 'string' && sample.waterActivity.trim()) patch.waterActivity = formatWaterActivity(sample.waterActivity);
  return patch;
};

export const hasSampleLookupConflict = (sample, patch) => Object.entries(patch).some(([key, value]) => {
  const existing = String(sample[key] ?? '').trim();
  return existing && !(key === 'processing' && existing === 'Select One') && existing !== value;
});

export const applySampleLookup = (samples, syncId, id, patch, replace = false) => samples.map(sample => {
  if (sample.syncId !== syncId || labSampleId(sample.labSampleId) !== id || (!replace && hasSampleLookupConflict(sample, patch))) return sample;
  return { ...sample, ...patch };
});
