import { CATEGORISED_LEXICON, INITIAL_SCORE } from '../constants';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

export const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const getBaseTag = (tag) => tag.replace('Slight ', '').replace('Intense ', '');

const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // Ignore CR in CRLF sequences.
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
};

const parseTagsCell = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/;\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
};

const formatWaterActivity = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const numeric = Number.parseFloat(raw);
  if (Number.isNaN(numeric)) return '';
  const clamped = Math.min(Math.max(numeric, 0), 0.99);
  return clamped.toFixed(2);
};

const formatMoisture = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const numeric = Number.parseFloat(raw.replace('%', ''));
  if (Number.isNaN(numeric)) return '';
  const clamped = Math.min(Math.max(numeric, 0), 100);
  return clamped.toFixed(1);
};

const parseOtherNotesCell = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { otherText: '', acidityLevel: '', sweetnessLevel: '' };

  const parts = raw.split(/;\s*/).map((p) => p.trim()).filter(Boolean);
  let acidityLevel = '';
  let sweetnessLevel = '';
  const leftovers = [];

  for (const part of parts) {
    const sweetnessMatch = part.match(/^(Low|Med-|Med|Med\+|High)\s+sweetness$/i);
    const acidityMatch = part.match(/^(Low|Med-|Med|Med\+|High)\s+acidity$/i);
    if (sweetnessMatch) {
      sweetnessLevel = sweetnessMatch[1].replace(/^m/i, 'M').replace(/^\w/, (c) => c.toUpperCase());
    } else if (acidityMatch) {
      acidityLevel = acidityMatch[1].replace(/^m/i, 'M').replace(/^\w/, (c) => c.toUpperCase());
    } else {
      leftovers.push(part);
    }
  }

  return { otherText: leftovers.join('; '), acidityLevel, sweetnessLevel };
};

const inferSessionNameFromFilename = (filename) => {
  const base = String(filename ?? '').replace(/\.csv$/i, '');
  const prefix = 'Cupping_Report_';
  if (!base.startsWith(prefix)) return '';
  const rest = base.slice(prefix.length);
  const match = rest.match(/^(.*)_((?:\d{1,2}-\d{1,2}-\d{4})_(?:\d{1,2}-\d{2}-\d{2})_(?:AM|PM))$/i);
  if (!match) return '';
  const namePart = match[1];
  if (!namePart) return '';
  return namePart.replace(/_/g, ' ').trim();
};

export const getCategoryForItem = (item) => {
  const base = getBaseTag(item);
  for (const [cat, items] of Object.entries(CATEGORISED_LEXICON)) {
    if (items.includes(base)) return cat;
  }
  if (CATEGORISED_LEXICON[base]) return base;
  return null;
};

const normalizeSmartMatch = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const parseSmartMatch = (value, officialOptions) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 120) return null;

  const optionsByKey = new Map(officialOptions.map((option) => [normalizeSmartMatch(option), option]));
  const candidates = [];

  candidates.push(raw);
  candidates.push(raw.replace(/^["'`]+|["'`]+$/g, '').replace(/[.!]+$/g, '').trim());

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      candidates.push(parsed);
    } else if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      candidates.push(parsed[0]);
    } else if (parsed && typeof parsed === 'object') {
      candidates.push(parsed.match, parsed.option, parsed.tag);
    }
  } catch {
    // Non-JSON model output is handled by the plain string candidates above.
  }

  for (const candidate of candidates) {
    const match = optionsByKey.get(normalizeSmartMatch(candidate));
    if (match) return match;
  }

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

export const getSmartMatch = async (userInput, officialOptions, signal) => {
  if (!userInput || userInput.length < 3) return null;
  if (!apiKey) return null;

  const systemPrompt = `Coffee expert. Map the user's description to exactly one option from this list, or "None": ${JSON.stringify(
    officialOptions
  )}. Return only the option text or "None".`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userInput }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 24
          }
        })
      }
    );

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return parseSmartMatch(text, officialOptions);
  } catch {
    return null;
  }
};

export const initializeSamples = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ositoId: '',
    lotName: '',
    processing: 'Select One',
    processingOther: '',
    waterActivity: '',
    moisture: '',
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
    'Processing Details',
    'Water Activity',
    'Moisture',
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
    const proc = s.processing === 'Select One' ? 'N/A' : s.processing;
    const procDetails = s.processing === 'Other' ? s.processingOther : '';
    return [
      s.id,
      csvEscape(s.ositoId),
      csvEscape(s.lotName),
      csvEscape(proc),
      csvEscape(procDetails),
      csvEscape(s.waterActivity || ''),
      csvEscape(s.moisture || ''),
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

export const importSessionFromCSV = (csvText, filename) => {
  const rows = parseCsvText(String(csvText ?? ''));
  if (rows.length < 2) {
    throw new Error('This CSV file does not appear to contain any session rows.');
  }

  const header = rows[0].map((h) => String(h ?? '').trim());
  const colIndex = (name) => header.findIndex((h) => h.toLowerCase() === String(name).toLowerCase());

  const idxSample = colIndex('Sample #');
  const idxOsitoId = colIndex('Osito ID');
  const idxLotName = colIndex('Lot Name');
  const idxProcessing = colIndex('Processing');
  const idxProcessingDetails = colIndex('Processing Details');
  const idxWaterActivity = colIndex('Water Activity');
  const idxMoisture = colIndex('Moisture');

  const idxFragrance = colIndex('Fragrance');
  const idxAroma = colIndex('Aroma');
  const idxCleanCup = colIndex('Clean Cup');
  const idxSweetness = colIndex('Sweetness');
  const idxAcidity = colIndex('Acidity');
  const idxBody = colIndex('Body');
  const idxFlavor = colIndex('Flavor');
  const idxAftertaste = colIndex('Aftertaste');
  const idxBalance = colIndex('Balance');
  const idxConsistency = colIndex('Consistency');
  const idxOverall = colIndex('Overall');
  const idxDefects = colIndex('Defects');
  const idxCorrection = colIndex('Cup Correction');

  const idxFragAromaTags = colIndex('Frag/Aroma Notes');
  const idxInCupTags = colIndex('In the Cup Notes');
  const idxNegativeTags = colIndex('Negative Notes');
  const idxOtherNotes = colIndex('Other Notes');
  const idxSessionStart = colIndex('Session Start Time');

  if (idxSample === -1 || idxProcessing === -1) {
    throw new Error('This CSV file is missing required columns (Sample #, Processing).');
  }

  const samples = [];
  let sessionStartTime = '';

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const rawId = row[idxSample];
    const parsedId = Number.parseInt(String(rawId ?? '').trim(), 10);
    if (!Number.isFinite(parsedId)) continue;

    const rawProcessing = String(row[idxProcessing] ?? '').trim();
    const rawProcDetails = idxProcessingDetails >= 0 ? String(row[idxProcessingDetails] ?? '').trim() : '';
    let processing = rawProcessing || 'Select One';
    let processingOther = rawProcDetails;

    if (processing === 'N/A') processing = 'Select One';
    if (processing.toLowerCase().startsWith('other -')) {
      processing = 'Other';
      processingOther = processingOther || processing.replace(/^other\s*-\s*/i, '');
    }
    if (processingOther && processing !== 'Other') processing = 'Other';

    const moisture = idxMoisture >= 0 ? formatMoisture(row[idxMoisture]) : '';
    const waterActivity = idxWaterActivity >= 0 ? formatWaterActivity(row[idxWaterActivity]) : '';

    const numOr = (idx, fallback) => {
      if (idx < 0) return fallback;
      const n = Number.parseFloat(String(row[idx] ?? '').trim());
      return Number.isFinite(n) ? n : fallback;
    };

    const notesParsed = idxOtherNotes >= 0 ? parseOtherNotesCell(row[idxOtherNotes]) : { otherText: '', acidityLevel: '', sweetnessLevel: '' };

    samples.push({
      id: parsedId,
      ositoId: idxOsitoId >= 0 ? String(row[idxOsitoId] ?? '') : '',
      lotName: idxLotName >= 0 ? String(row[idxLotName] ?? '') : '',
      processing,
      processingOther,
      waterActivity,
      moisture,
      scores: {
        fragrance: numOr(idxFragrance, INITIAL_SCORE),
        aroma: idxAroma >= 0 ? numOr(idxAroma, INITIAL_SCORE) : null,
        cleanCup: numOr(idxCleanCup, INITIAL_SCORE),
        sweetness: numOr(idxSweetness, INITIAL_SCORE),
        acidity: numOr(idxAcidity, INITIAL_SCORE),
        body: numOr(idxBody, INITIAL_SCORE),
        flavor: numOr(idxFlavor, INITIAL_SCORE),
        aftertaste: numOr(idxAftertaste, INITIAL_SCORE),
        balance: numOr(idxBalance, INITIAL_SCORE),
        consistency: numOr(idxConsistency, INITIAL_SCORE),
        overall: numOr(idxOverall, INITIAL_SCORE),
        defects: numOr(idxDefects, 0),
        correction: numOr(idxCorrection, 0)
      },
      notes: {
        fragAromaTags: idxFragAromaTags >= 0 ? parseTagsCell(row[idxFragAromaTags]) : [],
        inCupTags: idxInCupTags >= 0 ? parseTagsCell(row[idxInCupTags]) : [],
        negativeTags: idxNegativeTags >= 0 ? parseTagsCell(row[idxNegativeTags]) : [],
        otherText: notesParsed.otherText,
        acidityLevel: notesParsed.acidityLevel,
        sweetnessLevel: notesParsed.sweetnessLevel
      }
    });

    if (!sessionStartTime && idxSessionStart >= 0) {
      sessionStartTime = String(row[idxSessionStart] ?? '').trim();
    }
  }

  if (samples.length === 0) {
    throw new Error('No rows with a valid Sample # were found in this CSV.');
  }

  return {
    samples,
    sessionStartTime: sessionStartTime || new Date().toLocaleString(),
    sessionName: inferSessionNameFromFilename(filename)
  };
};
