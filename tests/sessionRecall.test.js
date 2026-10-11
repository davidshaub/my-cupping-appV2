import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSessionCode, validateRecalledSession } from '../src/lib/sessionRecall.js';
import { initializeSamples } from '../src/lib/cupping.js';

test('recall accepts case, spaces and optional hyphen, but rejects ambiguous or short codes', () => {
  assert.equal(normalizeSessionCode(' k7mr 4x2p '), 'K7MR-4X2P');
  for (const code of ['1', '0000-0000', 'IIII-OOOO', 'K7MR']) assert.throws(() => normalizeSessionCode(code));
});
test('recall validates grades and descriptors without mutating the source', () => {
  const samples = initializeSamples(1).map(sample => ({ ...sample, syncId: 'sample-test' }));
  const session = { syncId: 'session-test', samples };
  const result = validateRecalledSession(session, 'K7MR4X2P');
  assert.equal(result.sessionCode, 'K7MR-4X2P');
  assert.equal(session.sessionCode, undefined);
  assert.deepEqual(result.samples, samples);
  assert.throws(() => validateRecalledSession({ samples: [] }, 'K7MR4X2P'));
});
