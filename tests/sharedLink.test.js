import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedCodeFromUrl,sharedInvitationUrl,withoutSharedLink} from '../src/lib/sharedLink.js';
test('new share links survive full navigation and old hash links still resolve',()=>{
  const root='https://example.com/my-cupping-appV2/';
  const link=sharedInvitationUrl(root+'?shared=OLD#shared=OLD','ABCD-EFGH');
  assert.equal(link,root+'?shared=ABCD-EFGH');
  assert.equal(sharedCodeFromUrl(link),'ABCD-EFGH');
  assert.equal(sharedCodeFromUrl(root+'#shared=ABCD-EFGH'),'ABCD-EFGH');
  assert.equal(sharedCodeFromUrl(root),'');
  assert.equal(withoutSharedLink(link),'/my-cupping-appV2/');
  assert.equal(withoutSharedLink(root+'?other=1#shared=ABCD-EFGH'),'/my-cupping-appV2/?other=1');
});
