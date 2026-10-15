import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { aggregateEvaluations, evaluationScore } from '../src/lib/collaboration.js';
import { initializeSamples } from '../src/lib/cupping.js';

test('notes-only contributors do not count as zero; aliases count once per person',()=>{
  const sample=initializeSamples(1)[0];
  const entries=[{mode:'quick',quickScore:87,notes:{...sample.notes,fragAromaTags:['Berries','Berry']}},{mode:'quick',quickScore:'',notes:{...sample.notes,fragAromaTags:['Berry']}}];
  const result=aggregateEvaluations(entries);
  assert.equal(result.score,87);assert.equal(result.scoreCount,1);assert.equal(result.contributorCount,2);assert.equal(result.counts.fragAromaTags.length,1);assert.equal(result.counts.fragAromaTags[0].count,2);assert.equal(result.attributes,null);
});
test('full-form total is independent of retained quick score; attributes require complete evaluations',()=>{
  const sample=initializeSamples(1)[0],entry={...sample,mode:'full',quickScore:90};
  assert.equal(evaluationScore(entry),85);assert.equal(evaluationScore({...entry,mode:'quick'}),90);
  assert.equal(aggregateEvaluations([entry]).attributes.aroma,8.5);
  assert.equal(aggregateEvaluations([entry,{...entry,noScore:true}]).attributes,null);
});

function backend(){
  const tables=new Map(),cache=new Map();
  const makeSheet=(name,rows=[['ID','Data','Cupper']])=>{const sheet={getDataRange:()=>({getValues:()=>structuredClone(rows)}),appendRow:row=>rows.push(row),getRange:(r,c,n,w)=>({setValues:values=>values.forEach((row,i)=>{rows[r+i-1]||=[];row.forEach((value,j)=>rows[r+i-1][c+j-1]=value);})})};tables.set(name,{sheet,rows});return sheet;};
  const book={getSheetByName:name=>tables.get(name)?.sheet,insertSheet:name=>makeSheet(name,[])};
  const ctx=vm.createContext({CUPPING_SPREADSHEET:'test',SpreadsheetApp:{openById:()=>book,flush(){}},ContentService:{createTextOutput:text=>({text})},CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(alg,s)=>[...createHash(alg).update(s).digest()]},literal_:s=>s,cuppingSheet_:()=>tables.get('Primary').sheet});
  vm.runInContext(fs.readFileSync(new URL('../server/collaboration.gs',import.meta.url),'utf8'),ctx);
  const post=(action,data={},id=randomUUID())=>{ctx.collaborationPost_({requestId:id,action,...data});return JSON.parse(cache.get('receipt:'+id));};
  return {ctx,post,tables,makeSheet};
}
test('one invitation isolates selected coffees, hidden results, own editing, and host controls',()=>{
  const b=backend(),samples=initializeSamples(2),hostToken=randomUUID(),guestToken=randomUUID(),otherToken=randomUUID();
  samples[0].notes.fragAromaTags=['Strawberry'];
  const {collaboration:{code}}=b.post('createInvitation',{hostToken,defaultMode:'quick',session:{name:'QA',cupper:'Host',samples:[samples[0]]}});
  const read=token=>JSON.parse(JSON.stringify(b.ctx.collaborationRead_({code,guestToken:token})));
  assert.equal(read(guestToken).coffees.length,1);assert.equal(read(guestToken).coffees[0].hostEvaluation,null);
  const entry={cupper:'Guest',mode:'quick',quickScore:87,scores:samples[0].scores,notes:samples[0].notes};
  assert.match(b.post('submitContribution',{code,guestToken,sampleId:samples[1].syncId,entry}).collaborationError,/not part/);
  const saved=b.post('submitContribution',{code,guestToken,sampleId:samples[0].syncId,entry}).collaboration.entry;
  assert.equal(read(guestToken).entries.length,1);assert.equal(read(otherToken).entries.length,0);
  assert.match(b.post('updateInvitation',{code,hostToken:otherToken,revealed:true}).collaborationError,/Host access/);
  assert.match(b.post('submitContribution',{code,guestToken,sampleId:samples[0].syncId,entry,revision:0}).collaborationError,/another tab/);
  assert.equal(b.post('submitContribution',{code,guestToken,sampleId:samples[0].syncId,entry:{...entry,mode:'full'},revision:saved.revision}).collaboration.saved,true);
  b.post('updateInvitation',{code,hostToken,revealed:true});assert.equal(read(otherToken).entries.length,1);assert.ok(read(otherToken).coffees[0].hostEvaluation);assert.equal('guestHash' in read(otherToken).entries[0],false);
  b.post('updateInvitation',{code,hostToken,closed:true});assert.match(b.post('submitContribution',{code,guestToken,sampleId:samples[0].syncId,entry,revision:2}).collaborationError,/closed/);
  b.post('updateInvitation',{code,hostToken,closed:false});assert.equal(b.post('submitContribution',{code,guestToken,sampleId:samples[0].syncId,entry,revision:2}).collaboration.saved,true);
  assert.equal(b.tables.get('Shared Contributions').rows.length,2,'one row updated rather than duplicated');
});
test('panel password gates lookups and fixed editions preserve primary sources',()=>{
  const b=backend(),sample=initializeSamples(1)[0];
  b.makeSheet('Primary',[['Sample ID','Session Code','App Data','Cupper'],[sample.syncId,'ABCD-EFGH',JSON.stringify({sample,session:{syncId:'session',name:'QA'}}),'David']]);
  const before=JSON.stringify(b.tables.get('Primary').rows);
  assert.match(b.post('panelLookup',{password:'wrong',sampleIds:[sample.syncId]}).collaborationError,/password/);
  assert.equal(b.post('panelLookup',{password:'C0ff33',sampleIds:[sample.syncId]}).collaboration.evaluations.length,1);
  assert.equal(b.post('panelLookup',{password:'C0ff33',sessionCodes:['abcdefgh']}).collaboration.evaluations.length,1);
  const panel={title:'Panel',coffees:[{sample,evaluations:[],summary:'Approved'}]};
  const id=b.post('savePanel',{password:'C0ff33',panel}).collaboration.panelId;
  panel.coffees[0].summary='Changed';
  assert.equal(b.post('loadPanel',{password:'C0ff33',panelId:id}).collaboration.panel.coffees[0].summary,'Approved');
  assert.equal(JSON.stringify(b.tables.get('Primary').rows),before);
});
