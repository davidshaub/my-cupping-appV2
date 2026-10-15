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
  assert.deepEqual(suggestSessionComparisons(records).map(g=>g.ids),[['A','B'],['C'],['D'],['E']]);
});
