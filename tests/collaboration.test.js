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
  const makeSheet=(name,rows=[['ID','Data','Cupper']])=>{
    const formatting={hidden:new Set(),widths:{},heights:[],formats:[]};
    const sheet={
      getDataRange:()=>({getValues:()=>structuredClone(rows),setWrapStrategy() {}}),
      getMaxColumns:()=>26,insertColumnsAfter(){},
      hideColumns:column=>formatting.hidden.add(column),
      setFrozenRows:count=>formatting.frozen=count,
      setColumnWidth:(column,width)=>formatting.widths[column]=width,
      setRowHeightsForced:(row,count,height)=>formatting.heights.push({row,count,height}),
      appendRow:row=>rows.push(row),
      getRange:(r,c,n,w)=>({
        setValues:values=>values.forEach((row,i)=>{rows[r+i-1]||=[];row.forEach((value,j)=>rows[r+i-1][c+j-1]=value);}),
        setWrapStrategy(){},setFontWeight(){},
        setNumberFormat:format=>formatting.formats.push({column:c,format})
      })
    };tables.set(name,{sheet,rows,formatting});return sheet;
  };
  const book={getSheetByName:name=>tables.get(name)?.sheet,insertSheet:name=>makeSheet(name,[])};
  const ctx=vm.createContext({CUPPING_SPREADSHEET:'test',SpreadsheetApp:{openById:()=>book,flush(){},WrapStrategy:{CLIP:'CLIP'}},ContentService:{createTextOutput:text=>({text})},CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(alg,s)=>[...createHash(alg).update(s).digest()]},literal_:s=>s,cuppingSheet_:()=>tables.get('Primary').sheet});
  vm.runInContext(fs.readFileSync(new URL('../server/collaboration.gs',import.meta.url),'utf8'),ctx);
  const post=(action,data={},id=randomUUID())=>{ctx.collaborationPost_({requestId:id,action,...data});return JSON.parse(cache.get('receipt:'+id));};
  return {ctx,post,tables,makeSheet,cache};
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

test('blind invitations withhold identities from guest responses until an authorized reveal',()=>{
  const b=backend(),samples=initializeSamples(2),hostToken=randomUUID(),guestToken=randomUUID();
  Object.assign(samples[0],{lotName:'Secret coffee',ositoId:'488.26',country:'Colombia',processing:'Washed'});
  const {collaboration:{code}}=b.post('createInvitation',{hostToken,defaultMode:'quick',blind:true,session:{name:'Secret coffee session',samples, syncId:'source-id'}});
  const read=extra=>JSON.parse(JSON.stringify(b.ctx.collaborationRead_({code,guestToken,...extra})));
  const hidden=read();
  assert.equal(hidden.invitation.name,'Blind cupping');assert.equal('sourceSessionId' in hidden.invitation,false);
  assert.equal(hidden.coffees[0].lotName,'Coffee 1');assert.equal(hidden.coffees[1].lotName,'Coffee 2');
  for(const key of ['ositoId','country','processing'])assert.equal(key in hidden.coffees[0],false);
  assert.equal(read({hostToken}).coffees[0].lotName,'Secret coffee');
  assert.ok(b.post('updateInvitation',{code,hostToken:guestToken,identitiesRevealed:true}).collaborationError);
  b.post('updateInvitation',{code,hostToken,revealed:true});
  assert.equal(read().coffees[0].lotName,'Secret coffee','sharing results reveals the coffees');
  b.post('updateInvitation',{code,hostToken,revealed:false});
  assert.equal(read().coffees[0].lotName,'Coffee 1');
  assert.ok(b.post('updateInvitation',{code,hostToken:guestToken,blind:false}).collaborationError);
  b.post('updateInvitation',{code,hostToken,blind:false});
  assert.equal(read().coffees[0].lotName,'Secret coffee');
  b.post('updateInvitation',{code,hostToken,blind:true});
  assert.equal(read().coffees[0].lotName,'Coffee 1');
  b.post('updateInvitation',{code,hostToken,identitiesRevealed:true});
  assert.equal(read().coffees[0].lotName,'Secret coffee');assert.equal(read().coffees[0].ositoId,'488.26');
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

test('existing Panel rows gain readable summaries without changing the snapshot or unrelated cells',()=>{
  const b=backend();
  const panel={title:'Supplier comparison',createdAt:'2026-10-15T18:45:00.000Z',coffees:[
    {name:'Mutana 1 Washed',sample:{ositoId:'488.26'},evaluations:[{cupper:'David'},{cupper:'María'}]},
    {sample:{lotName:'Other coffee',ositoId:'489.26'},evaluations:[{cupper:'David'}]}
  ]};
  const original=JSON.stringify(panel);
  b.makeSheet('Osito Panel Reports',[['ID','Data','Cupper','Unrelated'],['edition',original,'','=1+1']]);
  b.ctx.organizePanelReports();
  const {rows,formatting}=b.tables.get('Osito Panel Reports'),header=rows[0],cell=name=>rows[1][header.indexOf(name)];
  assert.equal(rows[1][1],original);assert.equal(rows[1][3],'=1+1');
  assert.equal(cell('Cuppers'),'David; María');
  assert.equal(cell('Report Title'),'Supplier comparison');
  assert.equal(cell('Lots / Coffees'),'Mutana 1 Washed; Other coffee');
  assert.equal(cell('Osito IDs'),'488.26; 489.26');assert.equal(cell('Coffee Count'),2);
  assert.equal(cell('Date of Report').toISOString(),panel.createdAt);
  assert.ok(formatting.hidden.has(2));assert.equal(formatting.frozen,1);
  assert.ok(formatting.heights.some(entry=>entry.height===32));
  const migrated=JSON.stringify(rows);b.ctx.organizePanelReports();assert.equal(JSON.stringify(rows),migrated);
});

test('legacy missing dates remain blank and each newly saved edition receives its own summary',()=>{
  const b=backend();
  b.makeSheet('Primary',[['Sample ID','Session Code','App Data','Cupper']]);
  b.makeSheet('Osito Panel Reports',[['ID','Data','Cupper'],['old',JSON.stringify({title:'Old report',coffees:[]}), ''],['broken','invalid JSON','']]);
  const result=b.post('savePanel',{password:'C0ff33',panel:{title:'New report',coffees:[{name:'Coffee',sample:{},evaluations:[{cupper:'Ana'}]}]}});
  assert.equal(result.collaboration.saved,true);
  const {rows}=b.tables.get('Osito Panel Reports'),headers=rows[0];
  assert.equal(rows[1][headers.indexOf('Date of Report')],'');
  assert.equal(rows[2][1],'invalid JSON');
  assert.equal(rows[3][headers.indexOf('Report Title')],'New report');
  assert.equal(rows[3][headers.indexOf('Cuppers')],'Ana');
  assert.equal(rows[3][headers.indexOf('Coffee Count')],1);
  assert.ok(Number.isFinite(rows[3][headers.indexOf('Date of Report')].getTime()));
});


test('batch autosave validates before writing, enforces ownership/revisions and retries after receipt expiry',()=>{
  const b=backend(),samples=initializeSamples(2),hostToken=randomUUID(),guestToken=randomUUID();
  const {collaboration:{code}}=b.post('createInvitation',{hostToken,defaultMode:'quick',session:{name:'Batch',samples}});
  const entry={...samples[0],cupper:'David',mode:'quick',quickScore:87};
  const items=samples.map(sample=>({sampleId:sample.syncId,entry,revision:0}));
  const requestId=randomUUID();
  const result=b.post('saveContributions',{code,guestToken,items},requestId);
  assert.equal(result.collaboration.entries.length,2);assert.ok(result.collaboration.entries.every(e=>e.revision===1));
  b.cache.delete('receipt:'+requestId);
  const retry=b.post('saveContributions',{code,guestToken,items},requestId);
  assert.ok(retry.collaboration.entries.every(e=>e.revision===1),'Receipt expiry must not duplicate the write');
  const invalid=[{...items[0],revision:1,entry:{...entry,quickScore:90}},{...items[1],revision:1,entry:{...entry,quickScore:200}}];
  assert.ok(b.post('saveContributions',{code,guestToken,items:invalid}).collaborationError);
  assert.ok(b.ctx.collaborationRead_({code,guestToken}).entries.every(e=>e.quickScore===87),'Invalid batches must not partially write');
  // A later request cannot overwrite these entries using stale revisions.
  assert.match(b.post('saveContributions',{code,guestToken,items}).collaborationError,/another tab/);
  assert.equal(b.ctx.collaborationRead_({code,guestToken}).entries.length,2);
  b.post('updateInvitation',{code,hostToken,closed:true});
  assert.match(b.post('saveContributions',{code,guestToken,items}).collaborationError,/closed/);
});
