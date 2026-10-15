import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSharedCupping, readSharedCuppings, rememberSharedCupping } from '../src/lib/sharedCuppingSearch.js';

test('shared cupping search matches codes, IDs, dates and coffee details across words',()=>{
  const entry={name:'Supplier tasting',code:'ABCD-EFGH',date:'10/15/2026',sourceSessionId:'session-123',coffees:[{syncId:'sample-456',ositoId:'488.26',lotName:'El Paraíso',country:'Colombia',processing:'Washed'}]};
  for(const query of ['abcdefgh','488.26','sample-456','session-123','10/15','paraiso washed','Supplier Colombia'])assert.equal(matchesSharedCupping(entry,query),true,query);
  assert.equal(matchesSharedCupping(entry,'paraiso natural'),false);
  assert.equal(matchesSharedCupping(entry,''),true);
});

test('host indexing enriches older invitations without duplicating them or storing evaluations',()=>{
  const values=new Map([['osito_invitations',JSON.stringify([{code:'ABCD-EFGH',name:'Old title',date:'10/15/2026'},{code:'ZZZZ-YYYY',name:'Another'}])]]);
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const result={isHost:true,invitation:{code:'ABCD-EFGH',name:'Supplier tasting'},coffees:[{syncId:'sample-456',lotName:'El Paraíso',ositoId:'488.26',notes:{otherText:'Private notes'},hostEvaluation:{cupper:'David'}}]};
  rememberSharedCupping(result);
  const entries=readSharedCuppings();
  assert.equal(entries.length,2);assert.equal(entries[0].date,'10/15/2026');assert.equal(entries[0].searchVersion,1);
  assert.equal(matchesSharedCupping(entries[0],'488.26'),true);
  assert.equal(JSON.stringify(entries).includes('Private notes'),false);
  rememberSharedCupping({...result,isHost:false,invitation:{code:'GUEST-ONLY'}});
  assert.equal(readSharedCuppings().length,2);
  values.set('osito_invitations','invalid JSON');assert.deepEqual(readSharedCuppings(),[]);
  delete globalThis.localStorage;
});
