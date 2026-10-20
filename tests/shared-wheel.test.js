import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFlavorWheel } from '../src/lib/flavorWheel.js';

test('shared wheel labels categories once and preserves existing proportions and notes', () => {
  const notes = { fragAromaTags: ['Raspberry', 'Pear', 'Caramel'], inCupTags: ['Floral', 'Raspberry'] };
  const original = structuredClone(notes);
  for (const width of [300, 390, 560]) {
    const regular = layoutFlavorWheel(notes, { width });
    const shared = layoutFlavorWheel(notes, { width, categoriesOnly: true });
    assert.equal(shared.labels.length, shared.groups.length);
    const sectors = wheel => wheel.groups.map(({ category, start, end }) => ({ category, start, end }));
    assert.deepEqual(sectors(shared), sectors(regular));
    assert.deepEqual(shared.labels.map(label => label.key), shared.groups.map(group => group.category));
    assert.ok(!shared.labels.some(label => label.lines.includes('Raspberry')));
    assert.ok(regular.labels.some(label => label.lines.includes('Raspberry')));
    for (const side of [-1, 1]) {
      const labels = shared.labels.filter(label => label.side === side).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) assert.ok(labels[i].y >= labels[i - 1].y + labels[i - 1].height);
    }
  }
  assert.deepEqual(notes, original);
});

test('category-only wheel handles empty and single-category profiles', () => {
  assert.equal(layoutFlavorWheel({}, { categoriesOnly: true }).labels.length, 0);
  assert.equal(layoutFlavorWheel({ inCupTags: ['Raspberry', 'Pear'] }, { categoriesOnly: true }).labels.length, 1);
});
