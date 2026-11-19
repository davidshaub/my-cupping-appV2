// Verifies the read-only AirTable-backed Sample ID lookup: lookupSample_ and the doGet
// "lookupSample" action. UrlFetchApp is mocked; no network or real AirTable token is used.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

let lastRequest = null, mockResponse = null, properties = { AIRTABLE_API_TOKEN: 'test-token' };
const runtime = vm.createContext({
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
  UrlFetchApp: { fetch: (url, options) => { lastRequest = { url, options }; return mockResponse; } },
  ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 'javascript' } },
});
vm.runInContext(await readFile('server/google-apps-script.gs', 'utf8'), runtime);

const respond = (code, body) => { mockResponse = { getResponseCode: () => code, getContentText: () => JSON.stringify(body) }; };
const doGetLookup = id => {
  const text = runtime.doGet({ parameter: { action: 'lookupSample', id, callback: 'ositoSyncTest' } }).text;
  return JSON.parse(text.slice('ositoSyncTest('.length, -2));
};

// Found: maps only the whitelisted fields, converts AirTable's 0-1 Moisture fraction to 0-100.
// NOTE: singleSelect fields (Sample Type, Country, Processing) come back from AirTable's real
// REST API as plain strings, NOT as {id,name,color} objects - that object shape only appeared
// when exploring the schema through a different tool. Mocking the wrong shape here once let a
// real bug (Sample Type silently never filling) slip past this very test, so these mocks must
// match the actual REST API response, not whatever shape seemed convenient.
respond(200, { records: [{ fields: { 'ID - Osito': 488.26, 'Lot Name': 'Esperanza', 'Sample Type': 'PSS', Moisture: 0.107, aW: 0.56, Country: 'Ethiopia', 'Roast ID': 4, Processing: 'Washed', Supplier: 'Long Miles' } }] });
let result = doGetLookup('3835');
assert.deepEqual(result.sampleLookup, { status: 'found', id: '3835', sample: { ositoId: '488.26', lotName: 'Esperanza', sampleType: 'PSS', moisture: '10.7', waterActivity: '0.56', country: 'Ethiopia', roastId: '4', processing: 'Washed', supplier: 'Long Miles' } });
assert.match(lastRequest.url, /appb33eKqdsHn03CM\/tbl9SXWK6ItEaWTbt/);
assert.match(lastRequest.url, /filterByFormula=%7BSample%20ID%7D%3D3835/);
assert.equal(lastRequest.options.headers.Authorization, 'Bearer test-token');

// A sample that only has a subset of fields populated (e.g. no Osito ID yet, an offer sample)
// returns only what it has - never throws, never fabricates a value.
respond(200, { records: [{ fields: { 'Lot Name': 'Offer sample only' } }] });
result = doGetLookup('9001');
assert.deepEqual(result.sampleLookup, { status: 'found', id: '9001', sample: { lotName: 'Offer sample only' } });

// Missing and ambiguous.
respond(200, { records: [] });
assert.deepEqual(doGetLookup('404').sampleLookup, { status: 'missing', id: '404' });
respond(200, { records: [{ fields: {} }, { fields: {} }] });
assert.deepEqual(doGetLookup('555').sampleLookup, { status: 'ambiguous', id: '555' });

// Invalid input never reaches AirTable at all.
lastRequest = null;
assert.match(doGetLookup('not-a-number').error, /invalidSampleId/);
assert.equal(lastRequest, null);

// A non-200 AirTable response surfaces as a clear, generic failure rather than a raw HTTP error.
respond(500, {});
assert.match(doGetLookup('3835').error, /airtableUnavailable/);

// With no Script Property configured yet, the endpoint fails clearly instead of leaking a token error.
properties = {};
assert.match(doGetLookup('3835').error, /airtableNotConfigured/);

console.log('Passed: found/missing/ambiguous/unconfigured/unavailable AirTable responses, whitelisted fields only, moisture unit conversion, and invalid input rejected before any network call.');
