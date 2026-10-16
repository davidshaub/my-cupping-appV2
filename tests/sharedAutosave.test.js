import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedAutosave} from '../src/lib/sharedAutosave.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
globalThis.localStorage=storage();
const saved=flight=>({entries:flight.items.map(item=>({...item.entry,id:item.sampleId,sampleId:item.sampleId,revision:item.revision+1}))});
function make(options={}){const store=new SharedAutosave({code:'ABCD-EFGH',storage:storage(),online:()=>true,send:async f=>saved(f),...options});store.hydrate([],'quick');store.preference('name','David');return store;}
test('offline edits across coffees persist and upload together after reload',async()=>{
  const local=storage();let online=false,calls=0;
  let queue=make({storage:local,online:()=>online,send:async f=>{calls++;return saved(f);}});
  queue.edit('one',{quickScore:'87'});queue.edit('two',{quickScore:88});queue.preference('mode','full');
  await queue.flush();assert.equal(calls,0);assert.equal(queue.status,'offline');
  queue=new SharedAutosave({code:'ABCD-EFGH',storage:local,online:()=>online,send:async f=>{calls++;assert.equal(f.items.length,2);assert.equal(f.items[0].entry.quickScore,87);return saved(f);}});
  assert.equal(queue.draft('one').mode,'full');assert.equal(queue.draft('two').quickScore,88);
  online=true;await queue.flush();assert.equal(calls,1);assert.equal(queue.status,'saved');assert.deepEqual(queue.state.pending,{});
});
test('late responses cannot overwrite newer edits and upload requests never overlap',async()=>{
  let finish,calls=0;const queue=make({send:flight=>{calls++;return new Promise(resolve=>{finish=()=>resolve(saved(flight));});}});
  queue.edit('one',{quickScore:87});const first=queue.flush();await queue.flush();assert.equal(calls,1);
  queue.edit('one',{quickScore:89});finish();await first;
  assert.equal(queue.draft('one').quickScore,89);assert.equal(queue.draft('one').revision,1);assert.equal(queue.state.pending.one,true);
  const second=queue.flush();finish();await second;assert.equal(queue.status,'saved');assert.equal(queue.draft('one').revision,2);
});
test('uncertain save is retried using the same request after reload',async()=>{
  const local=storage();let request;
  const queue=make({storage:local,send:async f=>{request=f.requestId;throw new Error('Connection lost');}});
  queue.edit('one',{quickScore:87});await queue.flush();assert.equal(queue.status,'retry');
  const restored=new SharedAutosave({code:'ABCD-EFGH',storage:local,online:()=>true,send:async f=>{if(request){assert.equal(f.requestId,request);request=null;}return saved(f);}});
  restored.edit('one',{quickScore:90});await restored.flush();assert.equal(restored.draft('one').quickScore,90);assert.equal(restored.state.pending.one,true);
  await restored.flush();assert.equal(restored.status,'saved');
});
test('name and mode are global, untouched coffees are not uploaded, and remote refresh preserves pending changes',async()=>{
  const queue=make();queue.edit('one',{quickScore:87});queue.preference('mode','full');
  assert.equal(queue.draft('unvisited').mode,'full');assert.equal(queue.draft('unvisited').cupper,'David');assert.equal(Object.keys(queue.state.pending).length,1);
  queue.hydrate([{own:true,sampleId:'one',quickScore:80,mode:'quick'}],'quick');assert.equal(queue.draft('one').quickScore,87);
  await queue.flush();assert.equal(queue.status,'saved');
  queue.hydrate([{own:true,sampleId:'one',quickScore:80,revision:0,mode:'quick'}],'quick');assert.equal(queue.draft('one').quickScore,87,'A stale refresh cannot replace a newer save');
});
test('server conflicts retain local observations and pause automatic retries',async()=>{
  const queue=make({send:async()=>{const e=new Error('This entry changed on another tab.');e.serverRejected=true;throw e;}});
  queue.edit('one',{quickScore:87});await queue.flush();assert.equal(queue.status,'blocked');assert.equal(queue.draft('one').quickScore,87);assert.equal(queue.state.flight,null);
});

test('compact acknowledgments preserve the complete local evaluation',async()=>{
  const queue=make({send:async flight=>({entries:flight.items.map(item=>({id:item.sampleId,sampleId:item.sampleId,revision:1}))})});
  queue.edit('one',{quickScore:87,notes:{...queue.draft('one').notes,otherText:'Keep these observations.'}});
  await queue.flush();assert.equal(queue.status,'saved');assert.equal(queue.draft('one').notes.otherText,'Keep these observations.');assert.equal(queue.draft('one').quickScore,87);
});
