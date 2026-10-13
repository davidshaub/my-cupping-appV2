import test from 'node:test';
import assert from 'node:assert/strict';
import { createLotCache, catalogIndex, LOT_CACHE_KEY, LOT_CACHE_AGE } from '../src/lib/lotCache.js';

const storage = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };
const lot = { lotName: 'Kebena', processing: 'Anaerobic Natural', country: 'Ethiopia' };
const found = id => ({ lotLookup: { id, status: 'found', lot } });

test('cached entries survive reload and work offline with no network access', async () => {
  const saved = storage(); let calls = 0;
  const cache = createLotCache({ storage: saved, now: () => 1000, online: () => true, reader: async () => { calls++; return { lotCatalog: [['145.26', lot.lotName, lot.processing, lot.country]] }; } });
  await cache.refresh();
  assert.equal((await cache.lookup('145.26')).lot.processing, lot.processing);
  assert.equal(calls, 1);
  const offline = createLotCache({ storage: saved, online: () => false, reader: () => assert.fail('No network expected') });
  assert.equal((await offline.lookup('145.26')).lot.lotName, 'Kebena');
  await assert.rejects(offline.lookup('999.26'), /offline/);
  const entry = JSON.parse(saved.getItem(LOT_CACHE_KEY)).entries[0];
  assert.deepEqual(Object.keys(entry.lot).sort(), ['country', 'lotName', 'processing']);
});

test('new IDs bypass cache and misses are never retained', async () => {
  let added = false, calls = 0;
  const cache = createLotCache({ storage: storage(), online: () => true, reader: async ({ id }) => { calls++; return added ? found(id) : { lotLookup: { id, status: 'missing' } }; } });
  assert.equal((await cache.lookup('600.26')).status, 'missing');
  added = true;
  assert.equal((await cache.lookup('600.26')).status, 'found');
  await cache.lookup('600.26');
  assert.equal(calls, 2);
});

test('refresh is single-flight, expires hourly, and failure preserves old records', async () => {
  let time = 1000, calls = 0, fail = false;
  const cache = createLotCache({ storage: storage(), now: () => time, online: () => true, reader: async () => { calls++; if (fail) throw Error('unavailable'); return { lotCatalog: [['1', 'Lot', 'Washed', 'Brazil']] }; } });
  await Promise.all([cache.refresh(), cache.refresh()]);
  assert.equal(calls, 1);
  assert.equal(cache.fresh(), true);
  time += LOT_CACHE_AGE;
  assert.equal(cache.fresh(), false);
  fail = true;
  await assert.rejects(cache.refresh());
  assert.equal((await cache.lookup('1')).lot.lotName, 'Lot');
});

test('duplicates are flagged, whitespace trimmed, and leading zeroes retained', () => {
  const index = catalogIndex([['01', 'A', 'Washed', 'Brazil'], ['1', 'B', 'Natural', 'Mexico'], [' 01 ', 'Different', 'Washed', 'Brazil'], ['01', 'A', 'Washed', 'Brazil']]);
  assert.equal(index.get('01').status, 'ambiguous');
  assert.equal(index.get('1').lot.lotName, 'B');
});

test('new live records survive an older catalog response arriving afterward', async () => {
  let complete;
  const cache = createLotCache({ storage: storage(), online: () => true, reader: ({ action, id }) => action === 'lotCatalog' ? new Promise(resolve => { complete = resolve; }) : Promise.resolve(found(id)) });
  const refresh = cache.refresh();
  await cache.lookup('new.26');
  complete({ lotCatalog: [] });
  await refresh;
  assert.equal(cache.has('new.26'), true);
});

test('bad catalog and full storage do not damage session storage or prevent memory lookup', async () => {
  const cache = createLotCache({ storage: { getItem: () => 'bad json', setItem: () => { throw Error('quota'); } }, online: () => true, reader: async () => ({ lotCatalog: [['1', 'Lot', 'Natural', 'Mexico']] }) });
  assert.equal((await cache.refresh()).persisted, false);
  assert.equal((await cache.lookup('1')).lot.lotName, 'Lot');
  assert.throws(() => catalogIndex([['1', 'Lot', 'Natural', 'Mexico', 'private data']]));
});
