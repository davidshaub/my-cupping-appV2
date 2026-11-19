import test from 'node:test';
import assert from 'node:assert/strict';
import { applySampleLookup, hasSampleLookupConflict, labSampleId, sampleLookupPatch } from '../src/lib/sampleLookup.js';

test('patch only includes fields AirTable actually returned, formatting moisture/water activity', () => {
  assert.deepEqual(sampleLookupPatch({ ositoId: '488.26', lotName: 'Esperanza', sampleType: 'PSS', moisture: '10.7', waterActivity: '0.56', country: 'Ethiopia', roastId: '4' }),
    { ositoId: '488.26', lotName: 'Esperanza', sampleType: 'PSS', moisture: '10.7', waterActivity: '0.56', country: 'Ethiopia', roastId: '4' });
  assert.deepEqual(sampleLookupPatch({ ositoId: '', lotName: '', sampleType: '', moisture: '', waterActivity: '', country: '', roastId: '' }), {});
  assert.deepEqual(sampleLookupPatch({ ositoId: '488.26' }), { ositoId: '488.26' });
  assert.throws(() => sampleLookupPatch(null), /invalidSampleLookup/);
});

test('processing is canonicalized the same way the Lot Summary lookup already does', () => {
  for (const processing of ['Washed', 'Natural', 'Honey', ' washed ']) {
    const patch = sampleLookupPatch({ processing });
    assert.notEqual(patch.processing, 'Other');
    assert.equal(patch.processingOther, '');
  }
  assert.deepEqual(sampleLookupPatch({ processing: 'Anaerobic Washed' }), { processing: 'Other', processingOther: 'Anaerobic Washed' });
  assert.deepEqual(sampleLookupPatch({ processing: '' }), {});
  // A fresh sample's untouched 'Select One' default must not look like a manual edit worth protecting.
  assert.equal(hasSampleLookupConflict({ processing: 'Select One' }, { processing: 'Washed', processingOther: '' }), false);
});

test('an offer sample with no Osito ID yet still gets its other fields filled, no error', () => {
  const samples = [{ syncId: 'a', labSampleId: '3835', ositoId: '', lotName: '', sampleType: '', moisture: '', waterActivity: '' }];
  const patch = sampleLookupPatch({ ositoId: '', lotName: 'Gildardo López Hoyos', sampleType: 'PSS', moisture: '10.7', waterActivity: '0.54' });
  assert.deepEqual(patch, { lotName: 'Gildardo López Hoyos', sampleType: 'PSS', moisture: '10.7', waterActivity: '0.54' });
  assert.equal(hasSampleLookupConflict(samples[0], patch), false);
  const applied = applySampleLookup(samples, 'a', '3835', patch);
  assert.equal(applied[0].lotName, 'Gildardo López Hoyos');
  assert.equal(applied[0].ositoId, '', 'no Osito ID was returned, so none was written');
});

test('lookup preserves manual edits, uses stable IDs regardless of row order, and rejects stale responses', () => {
  const samples = [
    { syncId: 'a', labSampleId: '3835', lotName: 'Manual name', sampleType: 'Arrival' },
    { syncId: 'b', labSampleId: '1427', lotName: '' }
  ];
  const patch = sampleLookupPatch({ lotName: 'Sheet name', sampleType: 'PSS', ositoId: '488.26' });
  assert.equal(hasSampleLookupConflict(samples[0], patch), true);
  assert.deepEqual(applySampleLookup(samples, 'a', '3835', patch), samples, 'conflicting manual edit is not silently overwritten');
  assert.equal(applySampleLookup([...samples].reverse(), 'a', '3835', patch, true)[1].lotName, 'Sheet name', 'force-apply works by stable syncId after reorder');
  assert.deepEqual(applySampleLookup(samples, 'a', '9999', patch, true), samples, 'a stale/mismatched id never applies, even forced');
  assert.equal(applySampleLookup(samples, 'b', '1427', patch)[1].lotName, 'Sheet name');
  assert.equal(samples[0].lotName, 'Manual name');
});

test('supplier from AirTable is kept on the sample so it can be exported to the sheet', () => {
  assert.deepEqual(sampleLookupPatch({ supplier: ' Long Miles ' }), { supplier: 'Long Miles' });
  assert.deepEqual(sampleLookupPatch({ supplier: '' }), {});
});
