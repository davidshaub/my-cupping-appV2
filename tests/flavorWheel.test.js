import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlavorProfile, layoutFlavorWheel, wheelProvenance, wrapWheelText } from '../src/lib/flavorWheel.js';

test('wheel merges modifiers and provenance without changing written notes', () => {
  const notes = { fragAromaTags: ['Slight Citrus', 'Chocolate'], inCupTags: ['Intense Citrus', 'Balanced'], negativeTags: ['Dusty/Concrete'] };
  const before = JSON.stringify(notes);
  const profile = buildFlavorProfile(notes);
  assert.equal(profile.descriptors.length, 2);
  assert.equal(wheelProvenance(profile.descriptors.find(d => d.name === 'Citrus')), 'Aroma + cup');
  assert.equal(JSON.stringify(notes), before);
});

test('inner category boundaries match their outer descriptor boundaries exactly', () => {
  const profile = buildFlavorProfile({ inCupTags: ['Citrus', 'Melon', 'Chocolate', 'Good Sweetness'] });
  for (const group of profile.groups) {
    const children = profile.descriptors.filter(d => d.category === group.category);
    assert.equal(group.start, children[0].start);
    assert.equal(group.end, children.at(-1).end);
  }
  assert.ok(Math.abs(profile.descriptors.at(-1).end - profile.descriptors[0].start - Math.PI * 2) < 1e-10);
});

test('English and Spanish labels do not collide at phone or desktop widths', () => {
  for (const width of [300, 375, 560]) for (const language of ['en', 'es']) {
    const wheel = layoutFlavorWheel({ inCupTags: ['Red Fruit', 'Plum', 'Citrus', 'Chocolate', 'Melon', 'Good Sweetness', 'Apple', 'Peach', 'Floral'] }, { width, language });
    for (const side of [-1, 1]) {
      const labels = wheel.labels.filter(l => l.side === side).sort((a,b) => a.y-b.y);
      labels.forEach((label, i) => {
        assert.ok(label.y >= 0);
        assert.ok(label.y + label.height <= wheel.height);
        if (i) assert.ok(label.y >= labels[i-1].y + labels[i-1].height);
      });
    }
  }
});

test('empty profiles and long words are supported', () => {
  assert.deepEqual(buildFlavorProfile(), { descriptors: [], groups: [] });
  assert.ok(wrapWheelText('abcdefghijklmnopqrstuvwxyz', 20, 10).every(line => line.length <= 3));
});

test('mobile descriptors wrap between words without fragmenting fruit names', () => {
  const notes = {fragAromaTags: ['Sweet', 'Berry', 'Pineapple', 'Maple Syrup'], inCupTags: ['Berry', 'Strawberry', 'Raspberry']};
  for (const width of [300, 320, 375, 560]) for (const language of ['en', 'es']) {
    const wheel = layoutFlavorWheel(notes, {width, language});
    for (const label of wheel.labels) {
      if (language === 'en' && !label.name.includes(' ')) assert.deepEqual(label.lines, [label.name]);
      const longest = Math.max(...label.lines.map(line => line.length * wheel.fontSize * 0.65));
      assert.ok(label.side > 0 ? label.x + longest <= width : label.x - longest >= 0);
    }
  }
});

test('seven-category screenshot uses whole category names in a consistent key', () => {
  const notes = { fragAromaTags: ['Dried Banana', 'Grain', 'Cocoa'], inCupTags: ['Terracotta', 'Brown, Roast', 'Phosphoric', 'Herbal'] };
  for (const width of [300, 560]) for (const language of ['en', 'es']) {
    const wheel = layoutFlavorWheel(notes, {width, language});
    assert.equal(wheel.useCategoryKey, true);
    assert.ok(wheel.groups.every(group => group.external && group.lines.length === 1));
  }
});

test('peanuts connector stays near its own segment instead of spanning half the wheel', () => {
  const notes = {fragAromaTags: ['Raspberry', 'Molasses'], inCupTags: ['Caramel', 'Almond', 'Peanuts']};
  const wheel = layoutFlavorWheel(notes);
  const label = wheel.labels.find(entry => entry.name === 'Peanuts');
  assert.ok(Math.hypot(label.x - label.anchor.x, label.connectorY - label.anchor.y) < 60);
  assert.ok(Math.abs(Math.cos(label.angle)) > 0.2);
});
