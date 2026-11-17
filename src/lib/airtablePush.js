import { calculateTotal } from './cupping.js';
import { modifierBase } from './tagModifiers.js';

export const labSampleIdOf = sample => String(sample?.labSampleId ?? '').trim();
// Matches the Apps Script side's own validation for an AirTable autoNumber Sample ID.
export const canPushSample = sample => /^\d{1,15}$/.test(labSampleIdOf(sample));

const uniqueBaseNames = tags => [...new Set(tags.map(modifierBase))];

// AirTable's Cup Profile/Negative Notes are canonical English descriptor names with no
// Slight/Intense modifier concept, so those are stripped here - same base-name logic the app
// already uses everywhere else a tag's identity (not its display text) matters. Fragrance/Aroma
// and In-the-Cup tags both land in Cup Profile since AirTable doesn't distinguish them.
export const buildCuppingPushPayload = sample => {
  const notes = sample.notes;
  return {
    labSampleId: labSampleIdOf(sample),
    score: sample.noScore ? null : Number(calculateTotal(sample)),
    cupProfile: uniqueBaseNames([...notes.fragAromaTags, ...notes.inCupTags]),
    negativeNotes: uniqueBaseNames(notes.negativeTags),
    otherText: [
      notes.sweetnessLevel ? `${notes.sweetnessLevel} sweetness` : null,
      notes.acidityLevel ? `${notes.acidityLevel} acidity` : null,
      notes.otherText || null
    ].filter(Boolean).join('; ')
  };
};
