import { calculateTotal } from './cupping.js';
import { normalizeLexiconMode } from './lexicon.js';

export const SPREADSHEET_ID = '1jSQkBTxNKAtdRXns9rY_5GrskRfF3MpsB6Z1ntYcdqE';
export const SHEET_ID = 58722764;
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_ID}`;
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

export const newSyncId = () => globalThis.crypto.randomUUID();
export const normalizeSessionIdentity = (session) => ({
  ...session,
  syncId: session.syncId || newSyncId(),
  samples: (session.samples || []).map(sample => ({ ...sample, syncId: sample.syncId || newSyncId() }))
});

const columnName = index => {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
};
const normalizeHeader = value => String(value || '').trim().toLowerCase();
const numberOrBlank = value => value === '' || value == null ? '' : Number.isFinite(Number(value)) ? Number(value) : '';

export const sampleSheetValues = (session, sample, index) => {
  const scores = sample.scores;
  const notes = sample.notes || {};
  return {
    'Table Position': index + 1,
    Country: sample.country || '', Coffee: sample.lotName || '', 'Osito ID/REF#': sample.ositoId || '',
    'Sample Type': sample.sampleType || '', Process: sample.processing === 'Other' ? sample.processingOther || 'Other' : sample.processing === 'Select One' ? '' : sample.processing,
    'Roast ID': sample.roastId || '', 'Date Cupped': session.startTime || session.date || '',
    Fragrance: scores.fragrance, Aroma: scores.aroma ?? '', 'Frag/Aroma': (scores.fragrance + (scores.aroma ?? scores.fragrance)) / 2,
    'Clean Cup': scores.cleanCup, Sweetness: scores.sweetness, Acidity: scores.acidity, Body: scores.body,
    Flavor: scores.flavor, Aftertaste: scores.aftertaste, Balance: scores.balance, Uniformity: scores.consistency,
    Overall: scores.overall, Defect: scores.defects, Correction: scores.correction, Score: sample.noScore ? '' : Number(calculateTotal(sample)),
    'Fragrance/Aroma': (notes.fragAromaTags || []).join('; '), 'On the Palate': (notes.inCupTags || []).join('; '),
    Negative: (notes.negativeTags || []).join('; '),
    'General Notes': [notes.sweetnessLevel && `${notes.sweetnessLevel} sweetness`, notes.acidityLevel && `${notes.acidityLevel} acidity`, notes.otherText].filter(Boolean).join('; '),
    'Session ID': session.syncId, 'Sample ID': sample.syncId,
    'App Data': JSON.stringify({ version: 1, session: { syncId: session.syncId, name: session.name, startTime: session.startTime, date: session.date, lexiconMode: session.lexiconMode }, sample }),
    // Optional columns: populate them if present without changing the sheet layout.
    'Session Name': session.name || '', 'Water Activity': numberOrBlank(sample.waterActivity), Moisture: numberOrBlank(sample.moisture),
    Lexicon: normalizeLexiconMode(session.lexiconMode), 'Scoring Status': sample.noScore ? 'No Score' : 'Scored'
  };
};

export const planSheetUpdates = (session, rows, title) => {
  if (!session.syncId || session.samples.some(sample => !sample.syncId)) throw new Error('googleMissingIds');
  const headers = rows[0] || [];
  const columns = new Map();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!key) return;
    if (columns.has(key)) throw new Error('googleDuplicateHeaders');
    columns.set(key, index);
  });
  for (const required of ['Session ID', 'Sample ID', 'Score', 'Uniformity']) {
    if (!columns.has(normalizeHeader(required))) throw new Error('googleMissingColumns');
  }
  const sessionColumn = columns.get('session id'), sampleColumn = columns.get('sample id');
  const existing = new Map();
  rows.slice(1).forEach((row, index) => {
    if (!row[sessionColumn] || !row[sampleColumn]) return;
    const key = JSON.stringify([String(row[sessionColumn]), String(row[sampleColumn])]);
    if (existing.has(key)) throw new Error('googleDuplicateRows');
    existing.set(key, index + 2);
  });
  const data = [], newRows = [], sampleIds = new Set();
  for (const [index, sample] of session.samples.entries()) {
    if (sampleIds.has(sample.syncId)) throw new Error('googleDuplicateRows');
    sampleIds.add(sample.syncId);
    const row = existing.get(JSON.stringify([session.syncId, sample.syncId]));
    const newValues = Array(headers.length).fill('');
    for (const [header, value] of Object.entries(sampleSheetValues(session, sample, index))) {
      const column = columns.get(normalizeHeader(header));
      if (column === undefined) continue;
      if (!row) { newValues[column] = value ?? ''; continue; }
      data.push({ range: `'${title.replace(/'/g, "''")}'!${columnName(column)}${row}`, values: [[value ?? '']] });
    }
    if (!row) newRows.push(newValues);
  }
  return { data, newRows };
};

const sheetRequest = (credential, fetcher) => {
  const request = async (path, options = {}) => {
    if (!credential.isCurrent() || Date.now() >= credential.expiresAt) throw new Error('googleReconnect');
    const response = await fetcher(`${API}${path}`, {
      ...options, headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) throw new Error('googleReconnect');
      if (response.status === 403) throw new Error('googleAccessError');
      if (response.status === 429) throw new Error('googleQuotaError');
      throw new Error('googleSyncError');
    }
    return result;
  };
  return request;
};

const readSheet = async (request) => {
  const metadata = await request('?fields=sheets.properties');
  const sheet = metadata.sheets?.find(item => item.properties.sheetId === SHEET_ID)?.properties;
  if (!sheet) throw new Error('googleSheetMissing');
  const range = `'${sheet.title.replace(/'/g, "''")}'`;
  const values = await request(`/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
  return { sheet, range, rows: values.values || [] };
};

export const syncSessionsToSheet = async (sessions, credential, fetcher = fetch) => {
  const request = sheetRequest(credential, fetcher);
  const { sheet, range, rows } = await readSheet(request);
  // Add only integration-owned columns; preserve the user's existing layout.
  const headers = rows[0] || [];
  const missing = ['Session ID', 'Sample ID', 'App Data'].filter(name => !headers.some(header => normalizeHeader(header) === normalizeHeader(name)));
  if (missing.length) {
    const requiredColumns = headers.length + missing.length;
    if (requiredColumns > sheet.gridProperties.columnCount) {
      await request(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ appendDimension: { sheetId: SHEET_ID, dimension: 'COLUMNS', length: requiredColumns - sheet.gridProperties.columnCount } }] }) });
    }
    await request('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: `${range}!${columnName(headers.length)}1`, values: [missing] }] }) });
    await request(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ updateDimensionProperties: { range: { sheetId: SHEET_ID, dimension: 'COLUMNS', startIndex: headers.length, endIndex: headers.length + missing.length }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } }] }) });
    headers.push(...missing);
    rows[0] = headers;
  }
  const plans = sessions.map(session => planSheetUpdates(session, rows, sheet.title));
  const data = plans.flatMap(plan => plan.data), newRows = plans.flatMap(plan => plan.newRows);
  if (data.length) await request('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  if (newRows.length) await request(`/values/${encodeURIComponent(range + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: newRows }) });
  return sessions.reduce((count, session) => count + session.samples.length, 0);
};

export const syncSessionToSheet = (session, credential, fetcher = fetch) => syncSessionsToSheet([session], credential, fetcher);

export const sessionsFromSheetRows = rows => {
  const headers = rows[0] || [];
  const col = name => headers.findIndex(header => normalizeHeader(header) === normalizeHeader(name));
  const dataColumn = col('App Data'), sessionColumn = col('Session ID'), sampleColumn = col('Sample ID');
  if (dataColumn < 0 || sessionColumn < 0 || sampleColumn < 0) return [];
  const sessions = new Map(), positions = new Map();
  for (const row of rows.slice(1)) {
    if (!row[dataColumn]) continue;
    let payload;
    try { payload = JSON.parse(row[dataColumn]); } catch { throw new Error('googleRecallError'); }
    if (!payload || typeof payload !== 'object') throw new Error('googleRecallError');
    const { session, sample } = payload;
    if (payload.version !== 1 || !session?.syncId || !sample?.syncId || session.syncId !== row[sessionColumn] || sample.syncId !== row[sampleColumn] || !sample.scores || !sample.notes) throw new Error('googleRecallError');
    const requiredScores = ['fragrance', 'cleanCup', 'sweetness', 'acidity', 'body', 'flavor', 'aftertaste', 'balance', 'consistency', 'overall', 'defects', 'correction'];
    if (requiredScores.some(key => !Number.isFinite(sample.scores[key])) ||
      (sample.scores.aroma != null && !Number.isFinite(sample.scores.aroma)) ||
      ['fragAromaTags', 'inCupTags', 'negativeTags'].some(key => !Array.isArray(sample.notes[key]) || sample.notes[key].some(value => typeof value !== 'string')) ||
      ['ositoId', 'lotName', 'country', 'sampleType', 'roastId', 'processing', 'processingOther'].some(key => sample[key] != null && typeof sample[key] !== 'string') ||
      (sample.notes.otherText != null && typeof sample.notes.otherText !== 'string')) throw new Error('googleRecallError');
    let entry = sessions.get(session.syncId);
    if (!entry) {
      entry = { ...session, id: session.syncId, samples: [], count: 0 };
      sessions.set(session.syncId, entry);
    }
    if (entry.samples.some(item => item.syncId === sample.syncId)) throw new Error('googleDuplicateRows');
    positions.set(sample.syncId, Number(row[col('Table Position')]) || entry.samples.length + 1);
    entry.samples.push(sample);
    entry.count++;
  }
  return [...sessions.values()].map(entry => ({ ...entry, samples: entry.samples.sort((a, b) => positions.get(a.syncId) - positions.get(b.syncId)) }));
};

export const recallSheetSessions = async (credential, fetcher = fetch) => {
  const { rows } = await readSheet(sheetRequest(credential, fetcher));
  return sessionsFromSheetRows(rows);
};
