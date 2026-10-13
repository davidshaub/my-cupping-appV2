// Paste this standalone file into Extensions > Apps Script in Cupping Lab Data.
// Deploy as a Web app: Execute as Me, Who has access: Anyone.
// Only this fixed spreadsheet and tab can be read or written by the endpoint.
const CUPPING_SPREADSHEET = '1jSQkBTxNKAtdRXns9rY_5GrskRfF3MpsB6Z1ntYcdqE';
const CUPPING_TAB = 58722764;
const OWNED_COLUMNS = ['Session ID', 'Sample ID', 'App Data', 'Session Code'];
const LOT_SOURCE_SPREADSHEET = '1hyfuTZSRZP1SQc5c-pQ3MpfRS_lJazK9Nww6HFvOskE';
const LOT_SOURCE_TAB = 1244711014;

// Read-only, exact-ID lookup. Never return unrelated inventory or financial columns.
function lookupLot_(rawId) {
  const id = String(rawId || '').trim();
  if (!id || id.length > 64 || /[\x00-\x1f]/.test(id)) throw new Error('invalidLotId');
  const sheet = SpreadsheetApp.openById(LOT_SOURCE_SPREADSHEET).getSheets().find(s => s.getSheetId() === LOT_SOURCE_TAB);
  if (!sheet) throw new Error('lotSourceMissing');
  const names = ['Lot ID', 'Mark', 'Processing', 'Origin'];
  const top = sheet.getRange(1, 1, Math.min(20, sheet.getLastRow()), sheet.getLastColumn()).getDisplayValues();
  const headerIndex = top.findIndex(row => names.every(name => row.filter(cell => cell.trim() === name).length === 1));
  if (headerIndex < 0) throw new Error('lotColumnsMissing');
  const headers = top[headerIndex].map(cell => cell.trim());
  const firstRow = headerIndex + 2, count = sheet.getLastRow() - firstRow + 1;
  if (count <= 0) return { status: 'missing', id };
  const ids = sheet.getRange(firstRow, headers.indexOf('Lot ID') + 1, count, 1).getDisplayValues();
  const matches = [];
  ids.forEach((row, index) => {
    if (row[0].trim() !== id) return;
    const values = sheet.getRange(firstRow + index, 1, 1, headers.length).getDisplayValues()[0];
    matches.push({ lotName: values[headers.indexOf('Mark')].trim(), processing: values[headers.indexOf('Processing')].trim(), country: values[headers.indexOf('Origin')].trim() });
  });
  if (!matches.length) return { status: 'missing', id };
  if (new Set(matches.map(value => JSON.stringify(value))).size > 1) return { status: 'ambiguous', id };
  return { status: 'found', id, lot: matches[0] };
}

function cuppingSheet_() {
  const sheet = SpreadsheetApp.openById(CUPPING_SPREADSHEET).getSheets().find(s => s.getSheetId() === CUPPING_TAB);
  if (!sheet) throw new Error('sheetMissing');
  return sheet;
}

function readCupping_(sheet) {
  const range = sheet.getDataRange();
  return { values: range.getValues(), formulas: range.getFormulas() };
}

function extendCuppingFilter_(sheet) {
  const filter = sheet.getFilter();
  const oldRange = filter && filter.getRange();
  const width = sheet.getLastColumn(), height = sheet.getMaxRows();
  if (oldRange && oldRange.getRow() === 1 && oldRange.getColumn() === 1 && oldRange.getNumColumns() === width && oldRange.getNumRows() === height) return;
  const criteria = [];
  if (filter) {
    for (let col = oldRange.getColumn(); col < oldRange.getColumn() + oldRange.getNumColumns(); col++) {
      const criterion = filter.getColumnFilterCriteria(col);
      if (criterion) criteria.push([col, criterion]);
    }
    filter.remove();
  }
  const expanded = sheet.getRange(1, 1, height, width).createFilter();
  criteria.forEach(([col, criterion]) => expanded.setColumnFilterCriteria(col, criterion));
}

// Run manually in the Apps Script editor, never through the public endpoint.
// The snapshot is authoritative for app-owned fields; manual sheet edits remain in the backup.
function repairCuppingSheet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('busy');
  try {
    const sheet = cuppingSheet_(), data = readCupping_(sheet);
    const headers = data.values[0];
    if (new Set(headers).size !== headers.length || OWNED_COLUMNS.some(name => !headers.includes(name))) throw new Error('Check sheet headers before repairing');
    const col = name => headers.indexOf(name), seen = new Set(), owners = new Map();
    const sessions = new Map();
    const records = data.values.slice(1).map((row, index) => {
      if (!row[col('App Data')]) {
        if (row[col('Session ID')] || row[col('Sample ID')]) throw new Error('Missing App Data on row ' + (index + 2));
        return null;
      }
      const entry = JSON.parse(row[col('App Data')]);
      const session = entry.session, sample = entry.sample;
      validateBatch_({ requestId: 'manual-repair-validation', sessions: [{ ...session, samples: [sample] }] });
      if (session.syncId !== row[col('Session ID')] || sample.syncId !== row[col('Sample ID')]) throw new Error('Identity mismatch on row ' + (index + 2));
      const key = JSON.stringify([session.syncId, sample.syncId]);
      if (seen.has(key)) throw new Error('Duplicate identity on row ' + (index + 2));
      seen.add(key);
      const code = row[col('Session Code')] || '';
      if (code && owners.has(code) && owners.get(code) !== session.syncId) throw new Error('Session code collision');
      if (code) owners.set(code, session.syncId);
      session.sessionCode = code;
      session.sharedRevision = entry.sharedRevision || 0;
      session.sharedUpdatedAt = entry.sharedUpdatedAt || null;
      const record = { row, index, entry, session, sample };
      if (!sessions.has(session.syncId)) sessions.set(session.syncId, []);
      sessions.get(session.syncId).push(record);
      return record;
    });
    const fallbackSessions = [];
    sessions.forEach(group => {
      if (new Set(group.map(record => record.session.sessionCode)).size !== 1) throw new Error('Inconsistent session codes');
      group.forEach(record => {
        const expected = valuesForSample_(record.session, record.sample, 0);
        // Match the displaced visible record, excluding dates whose cell formatting can differ.
        const fields = headers.filter(name => Object.prototype.hasOwnProperty.call(expected, name) && !OWNED_COLUMNS.includes(name) && !['Table Position', 'Date Cupped', 'Session Name'].includes(name));
        const candidates = data.values.slice(1).filter(row => fields.every(name => typeof expected[name] === 'number'
          ? row[col(name)] !== '' && Number(row[col(name)]) === expected[name]
          : String(row[col(name)] == null ? '' : row[col(name)]) === String(expected[name] == null ? '' : expected[name])));
        const positions = [...new Set(candidates.map(row => Number(row[col('Table Position')])) )];
        record.position = record.entry.position || (positions.length === 1 ? positions[0] : null);
      });
      const positions = group.map(record => record.position);
      if (positions.some(position => !Number.isInteger(position) || position < 1 || position > group.length) || new Set(positions).size !== group.length) {
        // Older snapshots did not store order. Use original coffee numbering only if unambiguous.
        const ids = group.map(record => Number(record.sample.id));
        if (ids.some(id => !Number.isInteger(id) || id < 1) || new Set(ids).size !== group.length) throw new Error('Cannot safely recover order for ' + group[0].session.name);
        const orderedIds = ids.slice().sort((a, b) => a - b);
        group.forEach(record => { record.position = orderedIds.indexOf(Number(record.sample.id)) + 1; });
        fallbackSessions.push(group[0].session.name || group[0].session.syncId);
      }
    });
    const restored = data.values.slice(1).map((row, index) => {
      const record = records[index];
      const values = record && valuesForSample_(record.session, record.sample, record.position - 1);
      return headers.map((header, c) => values && Object.prototype.hasOwnProperty.call(values, header)
        ? literal_(values[header]) : data.formulas[index + 1][c] || literal_(row[c]));
    });
    // Complete validation before making a backup or changing any cells.
    const backup = sheet.copyTo(sheet.getParent());
    backup.setName('Cupping backup ' + Date.now());
    if (restored.length) sheet.getRange(2, 1, restored.length, headers.length).setValues(restored);
    extendCuppingFilter_(sheet);
    SpreadsheetApp.flush();
    console.log(JSON.stringify({ backup: backup.getName(), restoredRows: seen.size, originalNumberingRestoredFor: fallbackSessions }));
  } finally { lock.releaseLock(); }
}

function literal_(value) {
  if (value == null) return '';
  // Submitted text is never allowed to become a spreadsheet formula.
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function valuesForSample_(session, sample, index) {
  const scores = sample.scores, notes = sample.notes;
  const average = (scores.fragrance + (scores.aroma == null ? scores.fragrance : scores.aroma)) / 2;
  const others = ['cleanCup', 'sweetness', 'acidity', 'body', 'flavor', 'aftertaste', 'balance', 'consistency', 'overall'].reduce((sum, key) => sum + scores[key], 0);
  const total = Math.ceil((average + others - scores.defects + scores.correction) * 4) / 4;
  return {
    'Table Position': index + 1, Country: sample.country || '', Coffee: sample.lotName || '',
    'Osito ID/REF#': sample.ositoId || '', 'Sample Type': sample.sampleType || '',
    Process: sample.processing === 'Other' ? sample.processingOther || 'Other' : sample.processing === 'Select One' ? '' : sample.processing || '',
    'Roast ID': sample.roastId || '', 'Date Cupped': session.startTime || session.date || '',
    Fragrance: scores.fragrance, Aroma: scores.aroma == null ? '' : scores.aroma, 'Frag/Aroma': average,
    'Clean Cup': scores.cleanCup, Sweetness: scores.sweetness, Acidity: scores.acidity, Body: scores.body,
    Flavor: scores.flavor, Aftertaste: scores.aftertaste, Balance: scores.balance, Uniformity: scores.consistency,
    Overall: scores.overall, Defect: scores.defects, Correction: scores.correction, Score: sample.noScore ? '' : total,
    'Fragrance/Aroma': notes.fragAromaTags.join('; '), 'On the Palate': notes.inCupTags.join('; '),
    Negative: notes.negativeTags.join('; '),
    'General Notes': [notes.sweetnessLevel && notes.sweetnessLevel + ' sweetness', notes.acidityLevel && notes.acidityLevel + ' acidity', notes.otherText].filter(Boolean).join('; '),
    'Session ID': session.syncId, 'Sample ID': sample.syncId, 'Session Code': session.sessionCode,
    'App Data': JSON.stringify({ version: 3, position: index + 1, sharedRevision: session.sharedRevision || 0, sharedUpdatedAt: session.sharedUpdatedAt || null, session: { syncId: session.syncId, name: session.name, startTime: session.startTime, date: session.date, lexiconMode: session.lexiconMode }, sample }),
    'Session Name': session.name || '', 'Water Activity': sample.waterActivity || '', Moisture: sample.moisture || '',
    Lexicon: session.lexiconMode || 'osito', 'Scoring Status': sample.noScore ? 'No Score' : 'Scored'
  };
}

function validateBatch_(body) {
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(body.requestId || '') || !Array.isArray(body.sessions) || !body.sessions.length || body.sessions.length > 20) throw new Error('invalidSession');
  const sessions = new Set();
  body.sessions.forEach(session => {
    if (!session || !/^[a-zA-Z0-9_-]{10,100}$/.test(session.syncId || '') || sessions.has(session.syncId) || !Array.isArray(session.samples) || !session.samples.length || session.samples.length > 100) throw new Error('invalidSession');
    sessions.add(session.syncId);
    if (session.sharedRevision != null && (!Number.isSafeInteger(session.sharedRevision) || session.sharedRevision < 0)) throw new Error('invalidSession');
    ['name', 'startTime', 'date', 'lexiconMode'].forEach(key => { if (session[key] != null && typeof session[key] !== 'string') throw new Error('invalidSession'); });
    const ids = new Set();
    session.samples.forEach(sample => {
      if (!sample || !/^[a-zA-Z0-9_-]{10,100}$/.test(sample.syncId || '') || ids.has(sample.syncId) || !sample.scores || !sample.notes) throw new Error('invalidSession');
      ids.add(sample.syncId);
      const scores = sample.scores;
      if (['fragrance', 'cleanCup', 'sweetness', 'acidity', 'body', 'flavor', 'aftertaste', 'balance', 'consistency', 'overall', 'defects', 'correction'].some(key => !Number.isFinite(scores[key])) || (scores.aroma != null && !Number.isFinite(scores.aroma))) throw new Error('invalidSession');
      if (['fragAromaTags', 'inCupTags', 'negativeTags'].some(key => !Array.isArray(sample.notes[key]) || sample.notes[key].some(value => typeof value !== 'string'))) throw new Error('invalidSession');
      ['ositoId', 'lotName', 'country', 'sampleType', 'roastId', 'processing', 'processingOther', 'waterActivity', 'moisture'].forEach(key => { if (sample[key] != null && typeof sample[key] !== 'string') throw new Error('invalidSession'); });
      if (sample.notes.otherText != null && typeof sample.notes.otherText !== 'string') throw new Error('invalidSession');
      if (JSON.stringify(sample).length > 40000) throw new Error('sessionTooLarge');
    });
  });
}

function doPost(event) {
  let body, lock;
  try {
    const text = event.postData.contents;
    if (text.length > 1000000) throw new Error('sessionTooLarge');
    body = JSON.parse(text);
    validateBatch_(body);
    const cache = CacheService.getScriptCache(), receiptKey = 'receipt:' + body.requestId;
    if (cache.get(receiptKey)) return ContentService.createTextOutput('received');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('busy');
    const sheet = cuppingSheet_(), data = readCupping_(sheet);
    const headers = data.values[0] || [];
    const missing = OWNED_COLUMNS.filter(name => !headers.includes(name));
    if (missing.length) {
      const firstColumn = headers.length + 1;
      const needed = headers.length + missing.length - sheet.getMaxColumns();
      if (needed > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), needed);
      sheet.getRange(1, firstColumn, 1, missing.length).setValues([missing]);
      missing.forEach((name, index) => { if (name !== 'Session Code') sheet.hideColumns(firstColumn + index, 1); });
      headers.push.apply(headers, missing);
    }
    const columns = new Map();
    headers.forEach((header, index) => {
      const name = String(header).trim();
      if (!name) return;
      if (columns.has(name)) throw new Error('duplicateHeaders');
      columns.set(name, index);
    });
    if (!columns.has('Score') || !columns.has('Uniformity')) throw new Error('missingColumns');
    const existing = new Map(), sessionColumn = columns.get('Session ID'), sampleColumn = columns.get('Sample ID');
    data.values.slice(1).forEach((row, index) => {
      if (!row[sessionColumn] || !row[sampleColumn]) return;
      const key = JSON.stringify([row[sessionColumn], row[sampleColumn]]);
      if (existing.has(key)) throw new Error('duplicateRows');
      existing.set(key, index + 2);
    });
    let nextRow = Math.max(2, data.values.length + 1);
    // Compare-and-swap under the same lock as the writes. Older clients cannot bypass it.
    const dataColumn = columns.get('App Data');
    body.sessions.forEach(session => {
      const stored = data.values.slice(1).filter(row => row[sessionColumn] === session.syncId);
      const revisions = stored.map(row => JSON.parse(row[dataColumn]).sharedRevision || 0);
      const revision = Math.max(0, ...revisions);
      if (stored.length && (body.protocol !== 2 || !Number.isSafeInteger(session.sharedRevision) || session.sharedRevision !== revision)) throw new Error('sharedConflict');
      if (!stored.length && session.sharedRevision > 0) throw new Error('sharedConflict');
      session.sharedRevision = revision + 1;
      session.sharedUpdatedAt = new Date().toISOString();
    });
    const codes = {}, owners = new Map(), codeColumn = columns.get('Session Code');
    data.values.slice(1).forEach(row => {
      if (row[codeColumn] && row[sessionColumn]) {
        codes[row[sessionColumn]] = String(row[codeColumn]);
        owners.set(String(row[codeColumn]), row[sessionColumn]);
      }
    });
    body.sessions.forEach(session => {
      let code = codes[session.syncId];
      while (!code || (owners.has(code) && owners.get(code) !== session.syncId)) {
        const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
        const raw = bytes.slice(0, 8).map(b => alphabet[(b + 256) % alphabet.length]).join('');
        code = raw.slice(0, 4) + '-' + raw.slice(4);
      }
      session.sessionCode = code;
      codes[session.syncId] = code;
      owners.set(code, session.syncId);
    });
    const updates = [];
    body.sessions.forEach(session => session.samples.forEach((sample, index) => {
      const position = session.positions && session.positions[sample.syncId] || index + 1;
      if (!Number.isInteger(position) || position < 1 || position > 100) throw new Error('invalidSession');
      const values = valuesForSample_(session, sample, position - 1);
      const key = JSON.stringify([session.syncId, sample.syncId]);
      const rowNumber = existing.get(key) || nextRow++;
      const original = data.values[rowNumber - 1] || [];
      const row = headers.map((header, col) => {
        if (Object.prototype.hasOwnProperty.call(values, header)) return literal_(values[header]);
        // Preserve formulas and unrelated cells in an existing row.
        return data.formulas[rowNumber - 1] && data.formulas[rowNumber - 1][col] || (original[col] == null ? '' : original[col]);
      });
      if (headers.some((header, col) => Object.prototype.hasOwnProperty.call(values, header) && String(original[col] == null ? '' : original[col]) !== String(values[header]))) updates.push({ rowNumber, row });
    }));
    // A delta still advances the entire session's revision, including unchanged coffees.
    const changedRows = new Set(updates.map(update => update.rowNumber));
    body.sessions.forEach(session => data.values.slice(1).forEach((original, index) => {
      const rowNumber = index + 2;
      if (original[sessionColumn] !== session.syncId || changedRows.has(rowNumber)) return;
      const entry = JSON.parse(original[dataColumn]);
      entry.sharedRevision = session.sharedRevision;
      entry.sharedUpdatedAt = session.sharedUpdatedAt;
      const row = headers.map((_, col) => data.formulas[rowNumber - 1]?.[col] || literal_(original[col]));
      row[dataColumn] = JSON.stringify(entry);
      updates.push({ rowNumber, row });
    }));
    if (nextRow - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), nextRow - 1 - sheet.getMaxRows());
    updates.sort((a, b) => a.rowNumber - b.rowNumber);
    // Write adjacent rows together instead of making requests for every cell.
    for (let i = 0; i < updates.length;) {
      const start = updates[i].rowNumber, values = [updates[i++].row];
      while (i < updates.length && updates[i].rowNumber === start + values.length) values.push(updates[i++].row);
      sheet.getRange(start, 1, values.length, headers.length).setValues(values);
    }
    extendCuppingFilter_(sheet);
    SpreadsheetApp.flush();
    cache.put(receiptKey, JSON.stringify({ saved: body.sessions.map(session => session.syncId), codes: Object.fromEntries(body.sessions.map(session => [session.syncId, session.sessionCode])), versions: Object.fromEntries(body.sessions.map(session => [session.syncId, { sharedRevision: session.sharedRevision, sharedUpdatedAt: session.sharedUpdatedAt }])) }), 600);
    return ContentService.createTextOutput('received');
  } catch (error) {
    if (body && /^[a-zA-Z0-9_-]{10,100}$/.test(body.requestId || '')) CacheService.getScriptCache().put('receipt:' + body.requestId, JSON.stringify({ error: String(error.message || 'unavailable') }), 600);
    return ContentService.createTextOutput('deferred');
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function doGet(event) {
  const callback = event.parameter.callback || '';
  if (!/^ositoSync[A-Za-z0-9_]+$/.test(callback)) return ContentService.createTextOutput('invalidCallback');
  let result, lock;
  try {
    if (event.parameter.action === 'lookupLot') {
      result = { lotLookup: lookupLot_(event.parameter.id) };
    } else if (event.parameter.action === 'receipt') {
      const id = event.parameter.requestId || '';
      if (!/^[a-zA-Z0-9_-]{10,100}$/.test(id)) throw new Error('invalidRequest');
      const receipt = CacheService.getScriptCache().get('receipt:' + id);
      result = receipt ? JSON.parse(receipt) : { pending: true };
    } else if (event.parameter.action === 'recall') {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new Error('busy');
      const raw = String(event.parameter.code || '').toUpperCase().replace(/[-\s]/g, '');
      if (!/^[2-9A-HJ-NP-Z]{8}$/.test(raw)) throw new Error('sessionNotFound');
      const code = raw.slice(0, 4) + '-' + raw.slice(4);
      const rows = cuppingSheet_().getDataRange().getValues(), headers = rows.shift();
      const codeCol = headers.indexOf('Session Code'), idCol = headers.indexOf('Session ID'), dataCol = headers.indexOf('App Data'), posCol = headers.indexOf('Table Position');
      if (codeCol < 0 || dataCol < 0 || idCol < 0) throw new Error('sessionNotFound');
      const match = rows.find(row => row[codeCol] === code);
      if (!match) throw new Error('sessionNotFound');
      const selected = rows.filter(row => row[idCol] === match[idCol]).sort((a, b) => Number(a[posCol]) - Number(b[posCol]));
      const entries = selected.map(row => ({ ...JSON.parse(row[dataCol]), legacyPosition: Number(row[posCol]) }));
      entries.sort((a, b) => (a.position || a.legacyPosition) - (b.position || b.legacyPosition));
      const newest = entries.reduce((a, b) => (a.sharedRevision || 0) >= (b.sharedRevision || 0) ? a : b);
      result = { protocol: 2, session: { ...newest.session, sharedRevision: newest.sharedRevision || 0, sharedUpdatedAt: newest.sharedUpdatedAt || null, sessionCode: code, samples: entries.map(entry => entry.sample) } };
    } else result = { error: 'invalidAction' };
  } catch (error) { result = { error: String(error.message || 'unavailable') }; }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
  const json = JSON.stringify(result).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
