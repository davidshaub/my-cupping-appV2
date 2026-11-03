// A session that already has rows in the sheet can gain a brand-new coffee later (added after the
// first sync, from any device). That new row must land next to the rest of its own session, not
// appended at the end of the whole sheet - otherwise it ends up beside some unrelated older session
// and looks like it never synced. See server/google-apps-script.gs doPost for the insertion logic.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initializeSamples } from '../src/lib/cupping.js';
import { normalizeSessionIdentity, sampleSheetValues } from '../src/lib/googleSheets.js';
import { sessionChanges } from '../src/lib/sharedSync.js';

const sessionA = normalizeSessionIdentity({ id: 1, name: 'Session A', samples: initializeSamples(10) });
const headers = [...Object.keys(sampleSheetValues(sessionA, sessionA.samples[0], 0))];
let rows = [headers];
const receipts = new Map();
const sheet = {
  getFilter: () => null,
  getLastColumn: () => headers.length,
  getSheetId: () => 58722764,
  getMaxColumns: () => headers.length,
  getMaxRows: () => 1000,
  getDataRange: () => ({ getValues: () => rows.map(row => [...row]), getFormulas: () => rows.map(row => row.map(() => '')) }),
  getRange: (r, c, n, width) => ({
    createFilter: () => ({ setColumnFilterCriteria() {} }),
    setValues: values => { values.forEach((vals, index) => { rows[r + index - 1] ||= []; vals.forEach((value, col) => rows[r + index - 1][c + col - 1] = value); }); },
  }),
  insertRowsAfter: (afterRow, count) => { rows.splice(afterRow, 0, ...Array.from({ length: count }, () => headers.map(() => ''))); },
};
const output = text => ({ text, setMimeType() { return this; } });
const runtime = vm.createContext({
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, getUuid: randomUUID, computeDigest: (algorithm, value) => [...createHash(algorithm).update(value).digest()] },
  SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }), flush() {} },
  CacheService: { getScriptCache: () => ({ get: key => receipts.get(key), put: (key, value) => receipts.set(key, value) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, hasLock: () => true, releaseLock() {} }) },
  ContentService: { createTextOutput: output, MimeType: { JAVASCRIPT: 'javascript' } },
});
vm.runInContext(await readFile('server/google-apps-script.gs', 'utf8'), runtime);
const post = (sessions, requestId, protocol = 2) => runtime.doPost({ postData: { contents: JSON.stringify({ protocol, sessions, requestId }) } });
const sessionIdCol = headers.indexOf('Session ID'), posCol = headers.indexOf('Table Position');
const rowsFor = syncId => rows.map((row, i) => ({ i, row })).filter(({ row }) => row[sessionIdCol] === syncId);

// Session Z (oldest) and Session A sync first; Session B (newest) syncs after, pushing both down -
// so Session A is no longer the bottommost session in the sheet.
const sessionZ = normalizeSessionIdentity({ id: 0, name: 'Session Z', samples: initializeSamples(2) });
assert.equal(post([sessionChanges(sessionZ)], 'req-growth-z-0001').text, 'received');
assert.equal(post([sessionChanges(sessionA)], 'req-growth-a-0001').text, 'received');
const sessionB = normalizeSessionIdentity({ id: 2, name: 'Session B', samples: initializeSamples(3) });
assert.equal(post([sessionChanges(sessionB)], 'req-growth-b-0001').text, 'received');
assert.deepEqual(rowsFor(sessionA.syncId).map(r => r.row[posCol]), [1,2,3,4,5,6,7,8,9,10]);

// Add an 11th coffee to Session A after it has already synced (e.g. cupped later on another device).
const baseline = JSON.stringify(sessionA);
sessionA.samples.push(initializeSamples(1)[0]);
sessionA.sharedRevision = 1;
const delta = sessionChanges(sessionA, baseline);
assert.equal(delta.samples.length, 1, 'only the new 11th sample belongs in the delta');
assert.equal(post([delta], 'req-growth-a-0002').text, 'received');

// The new row must be contiguous with the session's other 10 rows, not appended past Session Z.
const aRows = rowsFor(sessionA.syncId);
assert.equal(aRows.length, 11);
assert.deepEqual(aRows.map(r => r.i), Array.from({ length: 11 }, (_, i) => aRows[0].i + i), 'Session A rows must be contiguous');
assert.deepEqual(aRows.map(r => r.row[posCol]), [1,2,3,4,5,6,7,8,9,10,11]);
// Session Z and B keep their own rows, undisturbed and still contiguous/ordered.
assert.deepEqual(rowsFor(sessionZ.syncId).map(r => r.row[posCol]), [1,2]);
assert.deepEqual(rowsFor(sessionB.syncId).map(r => r.row[posCol]), [1,2,3]);
assert.ok(rowsFor(sessionB.syncId).every(r => r.i < aRows[0].i), 'Session B stays above Session A');
assert.ok(rowsFor(sessionZ.syncId).every(r => r.i > aRows[aRows.length - 1].i), 'Session Z stays below Session A');

// Recall by code still reconstructs the full, now-11-sample session.
const code = aRows[0] && rows[aRows[0].i][headers.indexOf('Session Code')];
const recalledText = runtime.doGet({ parameter: { action: 'recall', code: code.toLowerCase().replace('-', ''), callback: 'ositoSyncTest' } }).text;
const recalled = JSON.parse(recalledText.slice('ositoSyncTest('.length, -2)).session;
assert.equal(recalled.samples.length, 11);

console.log('Passed: a coffee added after first sync lands next to its own session, not past an older one.');
