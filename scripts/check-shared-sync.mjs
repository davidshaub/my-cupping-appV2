import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
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
 getFilter: () => null,
 getLastColumn: () => headers.length,
 getSheetId: () => 58722764,
 getMaxColumns: () => headers.length,
 getMaxRows: () => 100,
 getDataRange: () => ({ getValues: () => rows.map(row => [...row]), getFormulas: () => rows.map((row, index) => row.map((_, col) => index && col === headers.length - 1 ? '=1+1' : '')) }),
 getRange: (r, c, n, width) => ({ createFilter: () => ({ setColumnFilterCriteria() {} }), setValues: values => { writeCount++; values.forEach((values, index) => { rows[r + index - 1] ||= []; values.forEach((value, col) => rows[r + index - 1][c + col - 1] = value); }); } }),
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
assert.equal(post([sessionChanges(session)], 'request-initial-123').text, 'received');
assert.equal(rows.length, 3);
const initialWrites = writeCount;
post([sessionChanges(session)], 'request-initial-123');
assert.equal(writeCount, initialWrites);
session.sharedRevision = 1;
rows[2][headers.length - 1] = 2;
session.samples[1].scores.consistency = 9;
post([sessionChanges(session, original)], 'request-update-123');
assert.equal(rows.length, 3);
assert.equal(rows[2][headers.indexOf('Uniformity')], 9);
assert.equal(rows[2][headers.indexOf('Table Position')], 2);
assert.equal(rows[2][headers.length - 1], '=1+1');
const afterUpdate = JSON.stringify(rows);
assert.equal(post([sessionChanges(session)], 'request-stale-123').text, 'deferred');
assert.equal(JSON.parse(receipts.get('receipt:request-stale-123')).error, 'sharedConflict');
assert.equal(JSON.stringify(rows), afterUpdate);
session.sharedRevision = 2;
assert.equal(post([sessionChanges(session)], 'request-old-client-123', 1).text, 'deferred');
assert.equal(JSON.stringify(rows), afterUpdate);
const dataCol = headers.indexOf('App Data');
assert.equal(JSON.parse(rows[1][dataCol]).sharedRevision, 2, 'Unchanged coffee advances with the session');
assert.equal(JSON.parse(rows[2][dataCol]).sharedRevision, 2);
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
assert.doesNotMatch(hook, /readSharedSessions|\bonRecall\b/);
assert.match(hook, /lastUpload.current \+ 30000/);
const code = rows[1][headers.indexOf('Session Code')];
assert.match(code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
assert.equal(rows[2][headers.indexOf('Session Code')], code);
const recalledText = runtime.doGet({ parameter: { action: 'recall', code: code.toLowerCase().replace('-', ''), callback: 'ositoSyncTest' } }).text;
const recalled = JSON.parse(recalledText.slice('ositoSyncTest('.length, -2)).session;
assert.equal(recalled.syncId, session.syncId);
assert.equal(recalled.samples.length, 2);
assert.equal(recalled.samples[1].scores.consistency, 9);
assert.equal(recalled.sessionCode, code);
assert.equal(recalled.sharedRevision, 2);
assert.ok(Number.isFinite(Date.parse(recalled.sharedUpdatedAt)));
const desktop = structuredClone(recalled);
desktop.samples[0].lotName = 'Desktop edit';
assert.equal(post([sessionChanges(desktop)], 'request-desktop-123').text, 'received');
assert.equal(rows.length, 3, 'Editing a recalled session does not append duplicates');
const boox = structuredClone(recalled);
boox.samples[0].lotName = 'Stale Boox edit';
assert.equal(post([sessionChanges(boox)], 'request-boox-stale-123').text, 'deferred');
assert.equal(rows[1][headers.indexOf('Coffee')], 'Desktop edit');
// An existing legacy session needs an explicit revision-zero recall before its first edit.
rows.slice(1).forEach(row => {
  const entry = JSON.parse(row[dataCol]);
  delete entry.sharedRevision;
  delete entry.sharedUpdatedAt;
  row[dataCol] = JSON.stringify(entry);
});
const legacy = structuredClone(desktop);
delete legacy.sharedRevision;
assert.equal(post([sessionChanges(legacy)], 'request-legacy-unsafe').text, 'deferred');
legacy.sharedRevision = 0;
assert.equal(post([sessionChanges(legacy)], 'request-legacy-safe').text, 'received');
assert.equal(JSON.parse(rows[1][dataCol]).sharedRevision, 1);
assert.match(runtime.doGet({ parameter: { action: 'recall', code: '1', callback: 'ositoSyncTest' } }).text, /sessionNotFound/);
console.log('Passed: stable codes, single-session recall, order, updated scores, invalid codes, delta uploads, formula preservation, receipts, and cooldown.');
