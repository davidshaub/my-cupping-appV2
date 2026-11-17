// Verifies the AirTable push-back: pushCuppingPost_ / the doPost "pushCupping" action.
// UrlFetchApp is mocked (list/create/patch); no network or real AirTable token is used.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

let requests = [], mockRecords = [], properties = { AIRTABLE_API_TOKEN: 'test-token' }, logs = [];
let locked = false, lockCount = 0, failStatus = null;
const runtime = vm.createContext({
  console: { log: message => logs.push(message) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
  CacheService: { getScriptCache: () => { const store = CacheService_store; return { get: key => store.get(key), put: (key, value) => store.set(key, value) }; } },
  LockService: { getScriptLock: () => ({ tryLock: () => { lockCount++; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
  ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 'javascript' } },
  UrlFetchApp: {
    fetch: (url, options) => {
      assert.equal(locked, true, 'every AirTable call must happen while the batch lock is held');
      const method = (options.method || 'get').toLowerCase();
      requests.push({ url, method, body: options.payload ? JSON.parse(options.payload) : null });
      if (failStatus) return { getResponseCode: () => failStatus, getContentText: () => JSON.stringify({ error: { type: 'AUTHENTICATION_REQUIRED', message: 'Invalid authentication token' } }) };
      if (method === 'get') return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ records: mockRecords }) };
      if (method === 'post') return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ records: [{ id: 'recLogNew' }] }) };
      if (method === 'patch') return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: mockRecords[0]?.id, fields: {} }) };
      throw new Error('unexpected method ' + method);
    },
  },
});
const CacheService_store = new Map();
vm.runInContext(await readFile('server/google-apps-script.gs', 'utf8'), runtime);

const post = body => runtime.doPost({ postData: { contents: JSON.stringify(body) } });
const receiptFor = requestId => JSON.parse(CacheService_store.get('receipt:' + requestId));
const samplePayload = (labSampleId, overrides = {}) => ({ labSampleId, score: 87.25, cupProfile: ['Floral', 'Chocolate'], negativeNotes: [], otherText: 'Clean finish.', cuppingDate: '2026-11-20', ...overrides });

// Wrong password never reaches AirTable at all.
mockRecords = [];
let result = post({ action: 'pushCupping', requestId: 'req-push-wrong-pw-01', password: 'nope', samples: [samplePayload('3835')] });
assert.equal(result.text, 'deferred');
assert.match(receiptFor('req-push-wrong-pw-01').error, /Incorrect Panel Report password/);
assert.equal(requests.length, 0);

// A Sample ID with no prior cupping (Score/Other Notes/Date Cupped all empty) updates in place -
// no archive row is created.
requests = [];
mockRecords = [{ id: 'recA', fields: {} }];
post({ action: 'pushCupping', requestId: 'req-push-fresh-0001', password: 'C0ff33', samples: [samplePayload('3835')] });
assert.deepEqual(receiptFor('req-push-fresh-0001').results, [{ labSampleId: '3835', status: 'updated' }]);
assert.equal(requests.filter(r => r.method === 'post').length, 0, 'no archive row for a first cupping');
const patchCall = requests.find(r => r.method === 'patch');
assert.match(patchCall.url, /\/recA$/);
assert.deepEqual(patchCall.body.fields, { Score: 87.25, 'Cup Profile': ['Floral', 'Chocolate'], 'Negative Notes': [], 'Other Notes': 'Clean finish.', 'Date Cupped': '2026-11-20' });
assert.equal(patchCall.body.typecast, true);

// A Sample ID that already has a cupping archives the OLD data to Cupping Log (linked back to the
// Master Sheet record) BEFORE Master Sheet is overwritten with the NEW cupping.
requests = [];
mockRecords = [{ id: 'recB', fields: { Score: 84, 'Cup Profile': ['Earthy'], 'Other Notes': 'Old notes.', 'Date Cupped': '2026-01-01' } }];
post({ action: 'pushCupping', requestId: 'req-push-repeat-0001', password: 'C0ff33', samples: [samplePayload('7445')] });
assert.deepEqual(receiptFor('req-push-repeat-0001').results, [{ labSampleId: '7445', status: 'archived' }]);
const createCall = requests.find(r => r.method === 'post');
assert.match(createCall.url, /tblNo6waRocS6ySb0$/);
assert.deepEqual(createCall.body.records[0].fields, { Sample: ['recB'], Score: 84, 'Cup Profile': ['Earthy'], 'Other Notes': 'Old notes.', 'Cupping Date': '2026-01-01' });
const patchCall2 = requests.find(r => r.method === 'patch');
assert.deepEqual(patchCall2.body.fields.Score, 87.25, 'Master Sheet now holds the NEW cupping, not the old one');
assert.ok(requests.indexOf(createCall) < requests.indexOf(patchCall2), 'archive happens before the overwrite');

// Missing / ambiguous Sample IDs are reported per-sample, not thrown as a batch failure.
requests = [];
mockRecords = [];
post({ action: 'pushCupping', requestId: 'req-push-missing-001', password: 'C0ff33', samples: [samplePayload('9999')] });
assert.deepEqual(receiptFor('req-push-missing-001').results, [{ labSampleId: '9999', status: 'notFound' }]);
mockRecords = [{ id: 'recC', fields: {} }, { id: 'recD', fields: {} }];
post({ action: 'pushCupping', requestId: 'req-push-ambig-0001', password: 'C0ff33', samples: [samplePayload('5000')] });
assert.deepEqual(receiptFor('req-push-ambig-0001').results, [{ labSampleId: '5000', status: 'ambiguous' }]);

// Invalid sample data (bad score) is rejected before any AirTable call, not silently clamped.
requests = [];
result = post({ action: 'pushCupping', requestId: 'req-push-badscore-01', password: 'C0ff33', samples: [samplePayload('3835', { score: 500 })] });
assert.match(receiptFor('req-push-badscore-01').error, /invalidSession/);
assert.equal(requests.length, 0);

// Retried request (same requestId) is a no-op, same dedup pattern as the primary sync.
requests = [];
mockRecords = [{ id: 'recA', fields: {} }];
post({ action: 'pushCupping', requestId: 'req-push-fresh-0001', password: 'C0ff33', samples: [samplePayload('3835')] });
assert.equal(requests.length, 0, 'a requestId with an existing receipt is never re-processed');

// Pushing the exact same cupping twice must be a no-op: no archive copy of itself, no rewrite. Tag
// order doesn't matter - AirTable may hand the same tags back in a different order.
requests = []; failStatus = null;
mockRecords = [{ id: 'recF', fields: { Score: 87.25, 'Cup Profile': ['Chocolate', 'Floral'], 'Other Notes': 'Clean finish.', 'Date Cupped': '2026-11-20' } }];
post({ action: 'pushCupping', requestId: 'req-push-same-000001', password: 'C0ff33', samples: [samplePayload('7001')] });
assert.deepEqual(receiptFor('req-push-same-000001').results, [{ labSampleId: '7001', status: 'unchanged' }]);
assert.deepEqual(requests.map(r => r.method), ['get'], 'an identical re-push only reads - no archive row, no overwrite');

// A genuinely different cupping of the same Sample ID still archives the old one and overwrites.
requests = [];
post({ action: 'pushCupping', requestId: 'req-push-changed-0001', password: 'C0ff33', samples: [samplePayload('7001', { score: 88 })] });
assert.deepEqual(receiptFor('req-push-changed-0001').results, [{ labSampleId: '7001', status: 'archived' }]);
assert.deepEqual(requests.map(r => r.method), ['get', 'post', 'patch']);

// Master Sheet must hold exactly the newest cupping: a field the new cupping lacks is cleared, not left stale.
requests = [];
mockRecords = [{ id: 'recG', fields: { Score: 87.25, 'Cup Profile': ['Floral', 'Chocolate'], 'Negative Notes': ['Papery'], 'Other Notes': 'Clean finish.', 'Date Cupped': '2026-11-20' } }];
post({ action: 'pushCupping', requestId: 'req-push-stale-00001', password: 'C0ff33', samples: [samplePayload('7001')] });
assert.deepEqual(receiptFor('req-push-stale-00001').results, [{ labSampleId: '7001', status: 'archived' }], 'dropping a field is a real change');
assert.deepEqual(requests.find(r => r.method === 'patch').body.fields['Negative Notes'], [], 'old Negative Notes cleared from Master Sheet');
assert.deepEqual(requests.find(r => r.method === 'post').body.records[0].fields['Negative Notes'], ['Papery'], 'and preserved in the archive');

// An AirTable-side failure (bad/expired token, wrong scope, etc.) reports a generic 'error' status
// to the client, but the REAL reason - AirTable's own response - must land in the Executions log,
// not disappear silently. This is what the user actually hit: 15 generic "error"s with no detail
// anywhere, because this logging didn't exist yet.
requests = []; logs = []; mockRecords = [{ id: 'recE', fields: {} }]; failStatus = 401;
post({ action: 'pushCupping', requestId: 'req-push-authfail-01', password: 'C0ff33', samples: [samplePayload('6001')] });
const failed = receiptFor('req-push-authfail-01').results;
assert.equal(failed[0].status, 'error');
assert.match(failed[0].detail, /AirTable GET 401 - AUTHENTICATION_REQUIRED: Invalid authentication token/, "the real reason reaches the client so it shows on screen, not just in logs");
assert.doesNotMatch(JSON.stringify(failed), /test-token/, 'the token is never returned to the client');
assert.ok(logs.some(line => line.includes('pushOneCupping_ failed for Sample ID 6001')), 'the failure is logged, not swallowed');
assert.ok(logs.some(line => line.includes('401') && line.includes('AUTHENTICATION_REQUIRED')), "AirTable's own error detail is logged");
failStatus = null;

console.log('Passed: update-in-place vs archive-then-overwrite, archive always precedes overwrite, password check, batch lock held for every AirTable call, missing/ambiguous reporting, input validation, request dedup, identical re-pushes being no-ops, and that AirTable-side failures are logged with real detail instead of a bare generic status.');
