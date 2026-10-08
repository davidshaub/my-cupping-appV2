import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
import { initializeSamples, buildSessionCSV, importSessionFromCSV } from '../src/lib/cupping.js';
import { normalizeSessionIdentity, sampleSheetValues, planSheetUpdates, sessionsFromSheetRows, syncSessionToSheet, SHEET_ID } from '../src/lib/googleSheets.js';

const session = normalizeSessionIdentity({ id: 1, name: 'Offline QA', startTime: '10/8/2026, 10:00:00 AM', date: '10/8/2026', lexiconMode: 'wcr', samples: initializeSamples(2) });
Object.assign(session.samples[0], { country: 'Brazil', sampleType: 'Pre-shipment', roastId: '0007', ositoId: '001.26' });
session.samples[0].notes.otherText = '=IMPORTDATA("example")';
session.samples[0].scores.consistency = 8.75;
session.samples[1].noScore = true;
const headers = Object.keys(sampleSheetValues(session, session.samples[0], 0));
const rowFor = (sample, index) => headers.map(header => sampleSheetValues(session, sample, index)[header]);
const rows = [headers, rowFor(session.samples[0], 0), rowFor(session.samples[1], 1)];
assert.equal(sampleSheetValues(session, session.samples[0], 0).Uniformity, 8.75);
assert.equal(sampleSheetValues(session, session.samples[1], 1).Score, '');
assert.equal(planSheetUpdates(session, [headers], 'Cupping Lab Data').newRows.length, 2);
const reordered = { ...session, samples: [...session.samples].reverse() };
const update = planSheetUpdates(reordered, rows, "QA's Sheet");
assert.equal(update.newRows.length, 0);
assert.ok(update.data.some(item => item.range === "'QA''s Sheet'!A3" && item.values[0][0] === 1));
assert.ok(update.data.some(item => item.range === "'QA''s Sheet'!A2" && item.values[0][0] === 2));
const restored = sessionsFromSheetRows(rows)[0];
assert.deepEqual(restored.samples, session.samples);
assert.equal(restored.lexiconMode, 'wcr');
assert.throws(() => planSheetUpdates(session, [...rows, rows[1]], 'QA'), /googleDuplicateRows/);
assert.throws(() => planSheetUpdates(session, [['Score']], 'QA'), /googleMissingColumns/);
const csv = buildSessionCSV(session.samples, session.startTime, session.lexiconMode, session.syncId);
const imported = importSessionFromCSV(csv, 'offline.csv');
assert.equal(imported.syncId, session.syncId);
assert.equal(imported.samples[0].syncId, session.samples[0].syncId);
assert.equal(imported.samples[0].roastId, '0007');
assert.equal(importSessionFromCSV(csv.replace('Uniformity', 'Consistency'), 'legacy.csv').samples[0].scores.consistency, 8.75);

const credential = { token: 'test-only', expiresAt: Date.now() + 60000, isCurrent: () => true };
let sheetRows = [headers];
let appends = 0, writes = 0;
const mockFetch = async (url, options = {}) => {
  if (url.includes('?fields=')) return { ok: true, json: async () => ({ sheets: [{ properties: { sheetId: SHEET_ID, title: 'QA', gridProperties: { rowCount: 100, columnCount: 50 } } }] }) };
  if (url.includes('valueRenderOption=')) return { ok: true, json: async () => ({ values: sheetRows }) };
  const body = JSON.parse(options.body);
  assert.equal(body.valueInputOption || new URL(url).searchParams.get('valueInputOption'), 'RAW');
  if (url.includes(':append')) { appends++; sheetRows.push(...body.values); }
  else if (url.includes('values:batchUpdate')) {
    writes++;
    for (const item of body.data) {
      const [, col, row] = item.range.match(/!([A-Z]+)(\d+)$/);
      let index = 0; for (const char of col) index = index * 26 + char.charCodeAt(0) - 64;
      sheetRows[Number(row) - 1][index - 1] = item.values[0][0];
    }
  } else assert.fail(`Unexpected request: ${url}`);
  return { ok: true, json: async () => ({}) };
};
await syncSessionToSheet(session, credential, mockFetch);
await syncSessionToSheet(session, credential, mockFetch);
assert.equal(appends, 1); assert.equal(writes, 1); assert.equal(sheetRows.length, 3);
await assert.rejects(syncSessionToSheet(session, { ...credential, expiresAt: 0 }, mockFetch), /googleReconnect/);
await assert.rejects(syncSessionToSheet(session, credential, async () => ({ ok: false, status: 403, json: async () => ({}) })), /googleAccessError/);
await assert.rejects(syncSessionToSheet(session, credential, async () => { throw new TypeError('offline'); }), /offline/);
// A lost append response must be recoverable by reading the identifiers again.
let lostResponse = true;
sheetRows = [headers]; appends = 0;
const intermittentFetch = async (...args) => {
  const result = await mockFetch(...args);
  if (args[0].includes(':append') && lostResponse) { lostResponse = false; throw new TypeError('connection lost'); }
  return result;
};
await assert.rejects(syncSessionToSheet(session, credential, intermittentFetch));
await syncSessionToSheet(session, credential, intermittentFetch);
assert.equal(appends, 1); assert.equal(sheetRows.length, 3);

// Exercise the actual generated worker with a cached app and failed network.
const worker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
const handlers = {}, cached = new Map();
const cache = { addAll: async urls => { for (const url of urls) { await stat(new URL(`../dist/${url.replace('/my-cupping-appV2/', '')}`, import.meta.url)); cached.set(url, { cached: url }); } }, match: async url => cached.get(url) };
const context = vm.createContext({ URL, self: { location: { origin: 'https://example.test' }, clients: { claim: async () => {} }, addEventListener: (name, callback) => { handlers[name] = callback; } }, caches: { open: async () => cache, keys: async () => [], delete: async () => true }, fetch: async () => { throw new TypeError('offline'); } });
vm.runInContext(worker, context);
let install;
handlers.install({ waitUntil: value => { install = value; } }); await install;
let response;
handlers.fetch({ request: { url: 'https://example.test/my-cupping-appV2/', method: 'GET', mode: 'navigate' }, respondWith: value => { response = value; } });
assert.equal((await response).cached, '/my-cupping-appV2/index.html');
const pdfAsset = [...cached.keys()].find(url => url.includes('/pdfReport-'));
handlers.fetch({ request: { url: `https://example.test${pdfAsset}`, method: 'GET' }, respondWith: value => { response = value; } });
assert.equal((await response).cached, pdfAsset);
let intercepted = false;
handlers.fetch({ request: { url: 'https://sheets.googleapis.com/v4/spreadsheets/example', method: 'GET' }, respondWith: () => { intercepted = true; } });
assert.equal(intercepted, false);
console.log('Passed: mapping, stable identifiers, CSV compatibility, session recall, repeated sync, lost-response recovery, auth/network failures, and offline app/PDF cache.');
