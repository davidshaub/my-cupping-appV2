import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { applyLotLookup, hasLotConflict, lotLookupPatch } from '../src/lib/lotLookup.js';

test('exact processing options canonicalize, everything else preserves full details', () => {
  for (const processing of ['Washed', 'Natural', 'Honey', ' washed ']) {
    const patch = lotLookupPatch({ lotName: 'Lot', country: 'Brazil', processing });
    assert.notEqual(patch.processing, 'Other');
    assert.equal(patch.processingOther, '');
  }
  assert.deepEqual(lotLookupPatch({ lotName: '', country: '', processing: 'Other' }), { processing: 'Other', processingOther: '' });
  for (const processing of ['EA Decaf', 'Anaerobic Natural', 'Fully Washed', 'Pulped Natural']) {
    const patch = lotLookupPatch({ lotName: '', country: '', processing });
    assert.deepEqual(patch, { processing: 'Other', processingOther: processing });
  }
  assert.deepEqual(lotLookupPatch({ lotName: '', country: '', processing: '' }), {});
});

test('lookup preserves manual edits, uses stable IDs after reorder, and rejects stale responses', () => {
  const samples = [{ syncId: 'a', ositoId: '145.26', lotName: 'Manual name', processing: 'Other', processingOther: 'My details' }, { syncId: 'b', ositoId: '146.26', processing: 'Select One' }];
  const patch = lotLookupPatch({ lotName: 'Sheet name', country: 'Brazil', processing: 'Washed' });
  assert.equal(hasLotConflict(samples[0], patch), true);
  assert.deepEqual(applyLotLookup(samples, 'a', '145.26', patch), samples);
  assert.equal(applyLotLookup([...samples].reverse(), 'a', '145.26', patch, true)[1].lotName, 'Sheet name');
  assert.deepEqual(applyLotLookup(samples, 'a', '999.26', patch, true), samples);
  assert.equal(applyLotLookup(samples, 'b', '146.26', patch)[1].processingOther, '');
  assert.equal(samples[0].lotName, 'Manual name');
});

test('server finds the header below summary rows, uses displayed IDs, and returns only approved fields', () => {
  let rows = [['summary', '', '', '', ''], ['', '', '', '', ''], ['Lot ID', 'Mark', 'Processing', 'Origin', 'Private'], ['145.26', 'Kebena', 'Natural', 'Ethiopia', 'secret'], ['0145.26', 'Other lot', 'Washed', 'Brazil', 'secret']];
  const sheet = {
    getSheetId: () => 1244711014, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
    getRange: (r, c, n, w) => ({ getDisplayValues: () => rows.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + w)) }),
  };
  const runtime = vm.createContext({ SpreadsheetApp: { openById: id => {
    assert.equal(id, '1hyfuTZSRZP1SQc5c-pQ3MpfRS_lJazK9Nww6HFvOskE');
    return { getSheets: () => [sheet] };
  } } });
  vm.runInContext(readFileSync('server/google-apps-script.gs', 'utf8'), runtime);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.lotCatalog_())), [['145.26', 'Kebena', 'Natural', 'Ethiopia'], ['0145.26', 'Other lot', 'Washed', 'Brazil']]);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.lookupLot_('145.26'))), { status: 'found', id: '145.26', lot: { lotName: 'Kebena', processing: 'Natural', country: 'Ethiopia' } });
  assert.equal(runtime.lookupLot_('145').status, 'missing');
  assert.equal(runtime.lookupLot_('0145.26').lot.lotName, 'Other lot');
  rows.push(['145.26', 'Conflict', 'Natural', 'Ethiopia', 'secret']);
  assert.equal(runtime.lookupLot_('145.26').status, 'ambiguous');
  rows[5][1] = 'Kebena';
  assert.equal(runtime.lookupLot_('145.26').status, 'found');
  rows[2][0] = 'Wrong Header';
  assert.throws(() => runtime.lookupLot_('145.26'), /lotColumnsMissing/);
});
