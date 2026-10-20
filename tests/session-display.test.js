import test from 'node:test';
import assert from 'node:assert/strict';
import { displaySessionName } from '../src/lib/sessionDisplay.js';

test('generated titles omit seconds without changing date or timezone', () => {
  assert.equal(displaySessionName('10/15/2026, 10:38:22 AM'), '10/15/2026, 10:38 AM');
  assert.equal(displaySessionName('15/10/2026, 14:38:22'), '15/10/2026, 14:38');
});
test('custom session titles and already shortened titles stay unchanged', () => {
  for (const title of ['Supplier cupping', 'Roast at 10:38:22 AM', '10/15/2026, 10:38 AM']) {
    assert.equal(displaySessionName(title), title);
  }
});
