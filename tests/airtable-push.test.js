import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSamples } from '../src/lib/cupping.js';
import { buildCuppingPushPayload, canPushSample, labSampleIdOf } from '../src/lib/airtablePush.js';

test('only a sample with a numeric Sample ID can be pushed', () => {
  const [sample] = initializeSamples(1);
  assert.equal(canPushSample(sample), false, 'blank labSampleId never pushes');
  assert.equal(canPushSample({ ...sample, labSampleId: '3835' }), true);
  assert.equal(canPushSample({ ...sample, labSampleId: 'abc' }), false);
  assert.equal(canPushSample({ ...sample, labSampleId: ' 42 ' }), true);
  assert.equal(labSampleIdOf({ ...sample, labSampleId: ' 42 ' }), '42');
});

test('payload strips modifiers, merges fragrance/in-cup tags, dedupes, and combines notes like the CSV export does', () => {
  const [sample] = initializeSamples(1);
  sample.labSampleId = '3835';
  sample.notes.fragAromaTags = ['Slight Floral', 'Chocolate'];
  sample.notes.inCupTags = ['Intense Chocolate', 'Caramel'];
  sample.notes.negativeTags = ['Slight Earthy'];
  sample.notes.sweetnessLevel = 'Slight';
  sample.notes.acidityLevel = 'Intense';
  sample.notes.otherText = 'Clean finish.';
  const payload = buildCuppingPushPayload(sample);
  assert.equal(payload.labSampleId, '3835');
  assert.deepEqual(payload.cupProfile, ['Floral', 'Chocolate', 'Caramel'], 'Chocolate appears once despite two modifier variants');
  assert.deepEqual(payload.negativeNotes, ['Earthy']);
  assert.equal(payload.otherText, 'Slight sweetness; Intense acidity; Clean finish.');
  assert.equal(typeof payload.score, 'number');
});

test('noScore sample pushes null score, not zero, and empty notes stay empty, not a stray "; "', () => {
  const [sample] = initializeSamples(1);
  sample.labSampleId = '100';
  sample.noScore = true;
  const payload = buildCuppingPushPayload(sample);
  assert.equal(payload.score, null);
  assert.equal(payload.otherText, '');
  assert.deepEqual(payload.cupProfile, []);
  assert.deepEqual(payload.negativeNotes, []);
});
