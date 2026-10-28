import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoffeeComparisons, planCoffeeComparisons, suggestSessionComparisons } from '../src/lib/panelComparisons.js';

test('two cuppers and five coffees produce five ordered comparisons, not one combined coffee', () => {
  const text=Array.from({length:5},(_,i)=>`david-${i+1}, maria-${i+1}`).join('\n');
  const lines=parseCoffeeComparisons(text);
  const records=lines.flatMap((ids,index)=>ids.map(id=>({id,sample:{ositoId:`lot-${index}`,lotName:`Coffee ${index+1}`}})));
  const groups=planCoffeeComparisons(lines,records.reverse());
  assert.equal(groups.length,5);
  assert.deepEqual(groups.map(g=>g.ids),lines);
  assert.deepEqual(groups.map(g=>g.name),['Coffee 1','Coffee 2','Coffee 3','Coffee 4','Coffee 5']);
});
test('blank lines and extra cuppers are supported; duplicate IDs and missing records cannot silently alter grouping', () => {
  assert.deepEqual(parseCoffeeComparisons(' A, B, C\r\n\r\n D, E '),[['A','B','C'],['D','E']]);
  assert.throws(()=>parseCoffeeComparisons('A,B\nB,C'),/more than once/);
  assert.throws(()=>parseCoffeeComparisons('A B'),/commas/);
  assert.throws(()=>planCoffeeComparisons([['A','missing']],[{id:'A',sample:{}}]),/not found/);
});
test('session suggestions match explicit lot IDs, never table position or name alone', () => {
  const records=[
    {id:'A',sample:{ositoId:'488.26',lotName:'Esperanza',roastId:'Roast A'}},
    {id:'B',sample:{ositoId:' 488.26 ',lotName:'Esperanza',roastId:'Roast B'}},
    {id:'C',sample:{ositoId:'489.26',lotName:'Esperanza'}},
    {id:'D',sample:{lotName:'Same name'}},
    {id:'E',sample:{lotName:'Same name'}}
  ];
  const result=suggestSessionComparisons(records);
  assert.deepEqual(result.groups.map(g=>g.ids),[['A','B'],['C'],['D'],['E']]);
  assert.equal(result.warning,'');
});
test('without Osito IDs, coffees from two sessions pair by table position instead', () => {
  const records=[
    {id:'d1',sessionCode:'HBBS',position:1,sample:{lotName:'Coffee 1'}},
    {id:'d2',sessionCode:'HBBS',position:2,sample:{lotName:'Coffee 2'}},
    {id:'k1',sessionCode:'SLRT',position:1,sample:{lotName:'Coffee 1'}},
    {id:'k2',sessionCode:'SLRT',position:2,sample:{lotName:'Coffee 2'}}
  ];
  const result=suggestSessionComparisons(records);
  assert.deepEqual(result.groups.map(g=>g.ids),[['d1','k1'],['d2','k2']]);
  assert.equal(result.warning,'');
});
test('uneven coffee counts between sessions still pair by position and warn instead of silently dropping extras', () => {
  const records=[
    {id:'d1',sessionCode:'HBBS',position:1,sample:{lotName:'Coffee 1'}},
    {id:'d2',sessionCode:'HBBS',position:2,sample:{lotName:'Coffee 2'}},
    {id:'d3',sessionCode:'HBBS',position:3,sample:{lotName:'Coffee 3'}},
    {id:'k1',sessionCode:'SLRT',position:1,sample:{lotName:'Coffee 1'}},
    {id:'k2',sessionCode:'SLRT',position:2,sample:{lotName:'Coffee 2'}}
  ];
  const result=suggestSessionComparisons(records);
  assert.deepEqual(result.groups.map(g=>g.ids),[['d1','k1'],['d2','k2'],['d3']]);
  assert.match(result.warning,/different coffee counts/);
});
test('a lone session without Osito IDs has nothing to pair against, so coffees stay separate', () => {
  const records=[
    {id:'d1',sessionCode:'HBBS',position:1,sample:{lotName:'Coffee 1'}},
    {id:'d2',sessionCode:'HBBS',position:2,sample:{lotName:'Coffee 2'}}
  ];
  const result=suggestSessionComparisons(records);
  assert.deepEqual(result.groups.map(g=>g.ids),[['d1'],['d2']]);
  assert.equal(result.warning,'');
});
