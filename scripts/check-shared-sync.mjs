import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { initializeSamples } from '../src/lib/cupping.js';
import { normalizeSessionIdentity, sampleSheetValues } from '../src/lib/googleSheets.js';
import { sessionChanges, saveSharedSessions } from '../src/lib/sharedSync.js';

const session = normalizeSessionIdentity({ id: 1, name: 'Sync QA', startTime: '10/8/2026', lexiconMode: 'osito', samples: initializeSamples(2) });
const original = JSON.stringify(session);
assert.equal(sessionChanges(session).samples.length, 2);
assert.equal(sessionChanges(session, original).samples.length, 0);
session.samples[1].country = 'Brazil';
const delta = sessionChanges(session, original);
assert.equal(delta.samples.length, 1);
assert.equal(delta.positions[session.samples[1].syncId], 2);
const headers = [...Object.keys(sampleSheetValues(session, session.samples[0], 0)), 'Unrelated'];
let rows = [headers], writeCount = 0;
const receipts = new Map();
const sheet = {
 getSheetId: () => 58722764,
 getMaxColumns: () => headers.length,
 getMaxRows: () => 100,
 getDataRange: () => ({ getValues: () => rows.map(row => [...row]), getFormulas: () => rows.map((row, index) => row.map((_, col) => index && col === headers.length - 1 ? '=1+1' : '')) }),
 getRange: (r, c, n, width) => ({ setValues: values => { writeCount++; values.forEach((values, index) => { rows[r + index - 1] ||= []; values.forEach((value, col) => rows[r + index - 1][c + col - 1] = value); }); } }),
};
const output = text => ({ text, setMimeType() { return this; } });
const runtime = vm.createContext({
 SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }), flush() {} },
 CacheService: { getScriptCache: () => ({ get: key => receipts.get(key), put: (key, value) => receipts.set(key, value) }) },
 LockService: { getScriptLock: () => ({ tryLock: () => true, hasLock: () => true, releaseLock() {} }) },
 ContentService: { createTextOutput: output, MimeType: { JAVASCRIPT: 'javascript' } },
});
vm.runInContext(await readFile('server/google-apps-script.gs', 'utf8'), runtime);
const post = (sessions, requestId) => runtime.doPost({ postData: { contents: JSON.stringify({ sessions, requestId }) } });
assert.equal(post([sessionChanges(session)], 'request-initial-123').text, 'received');
assert.equal(rows.length, 3);
const initialWrites = writeCount;
post([sessionChanges(session)], 'request-replay-123');
assert.equal(writeCount, initialWrites);
rows[2][headers.length - 1] = 2;
session.samples[1].scores.consistency = 9;
post([sessionChanges(session, original)], 'request-update-123');
assert.equal(rows.length, 3);
assert.equal(rows[2][headers.indexOf('Uniformity')], 9);
assert.equal(rows[2][headers.indexOf('Table Position')], 2);
assert.equal(rows[2][headers.length - 1], '=1+1');
const denied = runtime.doGet({ parameter: { action: 'sessions', callback: 'ositoSyncTest' } }).text;
assert.match(denied, /invalidAction/);
assert.doesNotMatch(denied, /Sync QA/);
let sentBody;
const lostResponse = async (_, options) => { sentBody = JSON.parse(options.body); throw new TypeError('Lost response'); };
const receipt = async params => { assert.equal(params.action, 'receipt'); assert.equal(params.requestId, sentBody.requestId); return { saved: [session.syncId] }; };
await saveSharedSessions([delta], undefined, lostResponse, 'https://example.test/exec', receipt);
await assert.rejects(saveSharedSessions([delta], undefined, async () => ({}), 'https://example.test/exec', async () => ({})), /sharedUnavailable/);
const app = await readFile('src/App.jsx', 'utf8');
assert.doesNotMatch(app, /renderGoogleSync|GoogleSheetsSync/);
const hook = await readFile('src/hooks/useGoogleSheets.js', 'utf8');
assert.doesNotMatch(hook, /readSharedSessions|onRecall/);
assert.match(hook, /lastUpload.current \+ 30000/);
console.log('Passed: changed samples only, stable positions, idempotent server writes, formula preservation, upload-only endpoint, receipt verification, no sync UI, and upload cooldown.');
