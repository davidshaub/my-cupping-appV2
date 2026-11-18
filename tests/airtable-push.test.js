import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSamples } from '../src/lib/cupping.js';
import { buildCuppingPushPayload, bytesToBase64, canPushSample, labSampleIdOf, toIsoDate } from '../src/lib/airtablePush.js';

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

test('the session start time becomes a plain YYYY-MM-DD date, with today as the fallback if it cannot be read', () => {
  const now = new Date(2026, 10, 20, 9, 0, 0);
  assert.equal(toIsoDate('11/17/2026, 6:00:41 PM', now), '2026-11-17');
  assert.equal(toIsoDate('2026-03-05T10:00:00', now), '2026-03-05');
  assert.equal(toIsoDate('17/11/2026, 18:00:41', now), '2026-11-20', 'a day-first string JS cannot parse falls back to today');
  assert.equal(toIsoDate(null, now), '2026-11-20');
  assert.equal(toIsoDate('', now), '2026-11-20');
});

test('bytesToBase64 round-trips large binary data (PDF bytes) without overflowing the call stack', () => {
  const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31) % 256);
  assert.deepEqual(new Uint8Array(Buffer.from(bytesToBase64(bytes), 'base64')), bytes);
});
