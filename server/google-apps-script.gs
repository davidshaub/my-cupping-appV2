// Paste this standalone file into Extensions > Apps Script in Cupping Lab Data.
// Deploy as a Web app: Execute as Me, Who has access: Anyone.
// Only this fixed spreadsheet and tab can be read or written by the endpoint.
const CUPPING_SPREADSHEET = '1jSQkBTxNKAtdRXns9rY_5GrskRfF3MpsB6Z1ntYcdqE';
const CUPPING_TAB = 58722764;
const OWNED_COLUMNS = ['Session ID', 'Sample ID', 'App Data'];

function cuppingSheet_() {
  const sheet = SpreadsheetApp.openById(CUPPING_SPREADSHEET).getSheets().find(s => s.getSheetId() === CUPPING_TAB);
  if (!sheet) throw new Error('sheetMissing');
  return sheet;
}

function readCupping_(sheet) {
  const range = sheet.getDataRange();
  return { values: range.getValues(), formulas: range.getFormulas() };
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
    'Session ID': session.syncId, 'Sample ID': sample.syncId,
    'App Data': JSON.stringify({ version: 1, session: { syncId: session.syncId, name: session.name, startTime: session.startTime, date: session.date, lexiconMode: session.lexiconMode }, sample }),
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
      sheet.hideColumns(firstColumn, missing.length);
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
    if (nextRow - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), nextRow - 1 - sheet.getMaxRows());
    updates.sort((a, b) => a.rowNumber - b.rowNumber);
    // Write adjacent rows together instead of making requests for every cell.
    for (let i = 0; i < updates.length;) {
      const start = updates[i].rowNumber, values = [updates[i++].row];
      while (i < updates.length && updates[i].rowNumber === start + values.length) values.push(updates[i++].row);
      sheet.getRange(start, 1, values.length, headers.length).setValues(values);
    }
    SpreadsheetApp.flush();
    cache.put(receiptKey, JSON.stringify({ saved: body.sessions.map(session => session.syncId) }), 600);
    return ContentService.createTextOutput('received');
  } catch (error) {
    if (body && /^[a-zA-Z0-9_-]{10,100}$/.test(body.requestId || '')) CacheService.getScriptCache().put('receipt:' + body.requestId, JSON.stringify({ error: String(error.message || 'unavailable') }), 600);
    return ContentService.createTextOutput('deferred');
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function doGet(event) {
  const callback = event.parameter.callback || '';
  if (!/^ositoSync[A-Za-z0-9_]+$/.test(callback)) return ContentService.createTextOutput('invalidCallback');
  let result;
  try {
    if (event.parameter.action === 'receipt') {
      const id = event.parameter.requestId || '';
      if (!/^[a-zA-Z0-9_-]{10,100}$/.test(id)) throw new Error('invalidRequest');
      const receipt = CacheService.getScriptCache().get('receipt:' + id);
      result = receipt ? JSON.parse(receipt) : { pending: true };
    } else result = { error: 'invalidAction' };
  } catch (error) { result = { error: String(error.message || 'unavailable') }; }
  const json = JSON.stringify(result).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
