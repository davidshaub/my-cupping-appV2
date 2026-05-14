import { CATEGORISED_LEXICON, INITIAL_SCORE } from '../constants';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

export const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const getBaseTag = (tag) => tag.replace('Slight ', '').replace('Intense ', '');

export const getCategoryForItem = (item) => {
  const base = getBaseTag(item);
  for (const [cat, items] of Object.entries(CATEGORISED_LEXICON)) {
    if (items.includes(base)) return cat;
  }
  if (CATEGORISED_LEXICON[base]) return base;
  return null;
};

export const getTagStyle = (tag) => {
  const cat = getCategoryForItem(tag);
  if (cat === 'Fruity' || cat === 'Structure') return 'tag-fruity';
  if (cat === 'Citrus') return 'tag-citrus';
  if (cat === 'Floral') return 'tag-floral';
  if (cat === 'Sweet') return 'tag-sweet';
  if (cat === 'Nutty/Cocoa') return 'tag-nutty';
  if (cat === 'Spices') return 'tag-spices';
  return 'tag-negative';
};

export const getSmartMatch = async (userInput, officialOptions) => {
  if (!userInput || userInput.length < 3) return null;
  if (!apiKey) return null;

  const systemPrompt = `Coffee expert. Map description to one: ${JSON.stringify(officialOptions)}. Return ONLY the string or "None".`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userInput }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      }
    );

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch {
    return 'None';
  }
};

export const initializeSamples = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ositoId: '',
    lotName: '',
    processing: 'Select One',
    processingOther: '',
    scores: {
      fragrance: INITIAL_SCORE,
      aroma: null,
      cleanCup: INITIAL_SCORE,
      sweetness: INITIAL_SCORE,
      acidity: INITIAL_SCORE,
      body: INITIAL_SCORE,
      flavor: INITIAL_SCORE,
      aftertaste: INITIAL_SCORE,
      balance: INITIAL_SCORE,
      consistency: INITIAL_SCORE,
      overall: INITIAL_SCORE,
      defects: 0,
      correction: 0
    },
    notes: { fragAromaTags: [], inCupTags: [], negativeTags: [], otherText: '', acidityLevel: '', sweetnessLevel: '' }
  }));

export const calculateTotal = (sample) => {
  const s = sample.scores;
  const fragAroma = s.aroma !== null ? (s.fragrance + s.aroma) / 2 : s.fragrance;
  const others = [
    s.cleanCup,
    s.sweetness,
    s.acidity,
    s.body,
    s.flavor,
    s.aftertaste,
    s.balance,
    s.consistency,
    s.overall
  ].reduce((a, b) => a + b, 0);
  const raw = fragAroma + others - s.defects + s.correction;
  return (Math.ceil(raw * 4) / 4).toFixed(2);
};

const toSafeFilenamePart = (value) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 60);
};

export const downloadCSV = (samples, sessionStartTime, sessionName) => {
  const headers = [
    'Sample #',
    'Osito ID',
    'Lot Name',
    'Processing',
    'Fragrance',
    'Aroma',
    'Average',
    'Clean Cup',
    'Sweetness',
    'Acidity',
    'Body',
    'Flavor',
    'Aftertaste',
    'Balance',
    'Consistency',
    'Overall',
    'Defects',
    'Cup Correction',
    'Score',
    'Frag/Aroma Notes',
    'In the Cup Notes',
    'Negative Notes',
    'Other Notes',
    'Session Start Time'
  ];

  const rows = samples.map((s) => {
    const proc = s.processing === 'Other' ? `Other - ${s.processingOther}` : s.processing === 'Select One' ? 'N/A' : s.processing;
    return [
      s.id,
      csvEscape(s.ositoId),
      csvEscape(s.lotName),
      csvEscape(proc),
      s.scores.fragrance.toFixed(2),
      (s.scores.aroma || s.scores.fragrance).toFixed(2),
      ((s.scores.fragrance + (s.scores.aroma || s.scores.fragrance)) / 2).toFixed(2),
      s.scores.cleanCup.toFixed(2),
      s.scores.sweetness.toFixed(2),
      s.scores.acidity.toFixed(2),
      s.scores.body.toFixed(2),
      s.scores.flavor.toFixed(2),
      s.scores.aftertaste.toFixed(2),
      s.scores.balance.toFixed(2),
      s.scores.consistency.toFixed(2),
      s.scores.overall.toFixed(2),
      s.scores.defects.toFixed(2),
      s.scores.correction.toFixed(2),
      calculateTotal(s),
      csvEscape(s.notes.fragAromaTags.join('; ')),
      csvEscape(s.notes.inCupTags.join('; ')),
      csvEscape(s.notes.negativeTags.join('; ')),
      csvEscape(
        [
          s.notes?.sweetnessLevel ? `${s.notes.sweetnessLevel} sweetness` : null,
          s.notes?.acidityLevel ? `${s.notes.acidityLevel} acidity` : null,
          s.notes.otherText || null
        ]
          .filter(Boolean)
          .join('; ')
      ),
      csvEscape(sessionStartTime)
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const stamp = new Date()
    .toLocaleString()
    .replace(/[/:]/g, '-')
    .replace(/,/g, '')
    .replace(/\s+/g, '_');
  const safeSessionName = toSafeFilenamePart(sessionName);
  link.download = safeSessionName ? `Cupping_Report_${safeSessionName}_${stamp}.csv` : `Cupping_Report_${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
