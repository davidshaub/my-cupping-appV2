import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsPanelPassword } from '../src/lib/panelAccess.js';
test('the panel UI gate accepts the configured password without a network request',async()=>{
  assert.equal(await acceptsPanelPassword('C0ff33'),true);
  assert.equal(await acceptsPanelPassword('wrong'),false);
});
