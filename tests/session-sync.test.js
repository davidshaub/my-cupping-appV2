import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionFingerprint, sessionSyncState, sessionChanges } from '../src/lib/sharedSync.js';

const session = { syncId: 'session-one', sessionCode: 'ABCD-2345', sharedRevision: 3, name: 'Saved coffee', samples: [{ syncId: 'lot-one', lotName: 'Original', notes: { cup: ['Cocoa'] } }] };

test('opening unchanged shared data is current, including legacy key ordering', () => {
  assert.equal(sessionSyncState(session, JSON.stringify(session)), 'current');
  const reordered = { ...session, samples: [{ notes: { cup: ['Cocoa'] }, lotName: 'Original', syncId: 'lot-one' }] };
  assert.equal(sessionSyncState(reordered, sessionFingerprint(session)), 'current');
  assert.deepEqual(sessionChanges(reordered, sessionFingerprint(session)).samples, []);
});

test('missing or untrusted baseline cannot trigger a shared upload', () => {
  for (const baseline of [undefined, '', 'invalid', '{}', JSON.stringify({ ...session, syncId: 'other' })]) {
    assert.equal(sessionSyncState(session, baseline), 'unknown');
  }
  assert.equal(sessionSyncState({ ...session, sharedRevision: undefined }, sessionFingerprint(session)), 'unknown');
});

test('real edits and new sessions still qualify for sync', () => {
  const edited = { ...session, samples: [{ ...session.samples[0], lotName: 'Updated' }] };
  assert.equal(sessionSyncState(edited, sessionFingerprint(session)), 'dirty');
  assert.equal(sessionChanges(edited, sessionFingerprint(session)).samples[0].lotName, 'Updated');
  assert.equal(sessionSyncState({ ...session, sessionCode: undefined }), 'dirty');
});
