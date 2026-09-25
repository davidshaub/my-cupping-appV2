import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORISED_LEXICON, NEGATIVE_LEXICON, CATEGORY_COLORS } from '../src/constants.js';
import { WCR_ATTRIBUTES, LEXICON_OPTIONS, canonicalTag, categoryForTag, normalizeLexiconMode } from '../src/lib/lexicon.js';
import { translateTag } from '../src/i18n.js';
import { downloadCSV, importSessionFromCSV, initializeSamples } from '../src/lib/cupping.js';

// Transcribed from the alphabetical index of WCR 2.0 (p. 54).
// The index has 109 unique entries; repeat appearances in sections are not new tags.
const indexedNames = `Acetic Acid|Acrid|Alcohol|Almond|Animalic|Anise|Apple|Ashy|Beany|Berry|Bitter|Black Tea|Blackberry|Blended|Blueberry|Body/Fullness|Brown Sugar|Brown, Roast|Brown Spice|Burnt|Butyric Acid|Caramelized|Cardboard|Chamomile|Cherry|Chocolate|Cinnamon|Citric Acid|Citrus Fruit|Clove|Cocoa|Coconut|Dark Chocolate|Dark Green|Dried Fruit|Fermented|Floral|Fresh|Fruity|Grain|Grape|Grapefruit|Green|Hay-like|Hazelnut|Herb-like|Honey|Isovaleric Acid|Jasmine|Lemon|Lime|Longevity|Malic Acid|Malt|Maple Syrup|Meaty/Brothy|Medicinal|Metallic|Molasses|Moldy/Damp|Mouth Drying|Musty/Dusty|Musty/Earthy|Nutmeg|Nutty|Oily|Olive Oil|Orange|Other Fruit|Overall Impact|Overall Sweet|Overripe/Near Fermented|Papery|Peach|Peanuts|Peapod|Pear|Pepper|Petroleum|Phenolic|Pineapple|Pipe Tobacco|Pomegranate|Prune|Pungent|Raisin|Raspberry|Raw|Roasted|Rose|Rubber|Salty|Skunky|Smoky|Sour|Sour Aromatics|Stale|Strawberry|Sweet|Sweet Aromatics|Thickness|Tobacco|Under-ripe|Vanilla|Vanillin|Vegetative|Whiskey|Winey|Woody`.split('|');

test('every distinct WCR index entry is present exactly once', () => {
  assert.deepEqual(WCR_ATTRIBUTES.map((a) => a.name).sort(), indexedNames.sort());
  assert.equal(new Set(WCR_ATTRIBUTES.map((a) => a.name)).size, WCR_ATTRIBUTES.length);
});

test('Osito retains all original terms and positive/negative assignments', () => {
  assert.deepEqual(Object.values(LEXICON_OPTIONS.osito.positive).flat().sort(), Object.values(CATEGORISED_LEXICON).flat().sort());
  assert.deepEqual(Object.values(LEXICON_OPTIONS.osito.negative).flat().sort(), [...NEGATIVE_LEXICON].sort());
  for (const tag of [...Object.values(CATEGORISED_LEXICON).flat(), ...NEGATIVE_LEXICON]) {
    assert.ok(categoryForTag(tag), tag);
    assert.ok(CATEGORY_COLORS[categoryForTag(tag)], tag);
  }
});

test('Both deduplicates equivalent terms within each field, but retains distinct compound terms', () => {
  for (const groups of Object.values(LEXICON_OPTIONS.both)) {
    const canonical = Object.values(groups).flat().map(canonicalTag);
    assert.equal(new Set(canonical).size, canonical.length);
  }
  const positive = Object.values(LEXICON_OPTIONS.both.positive).flat();
  for (const tag of ['Apple', 'Pear', 'Orchard Fruit (Apple, Pear)', 'Yellow Fruit']) assert.ok(positive.includes(tag));
  assert.equal(positive.filter((tag) => tag === 'Raspberry').length, 1);
  assert.equal(canonicalTag('Intense Paper'), canonicalTag('Papery'));
});

test('all WCR terms have Spanish labels and valid modifier agreement', () => {
  for (const attribute of WCR_ATTRIBUTES) {
    assert.ok(attribute.spanish);
    assert.ok(['fs', 'ms', 'fp', 'mp'].includes(attribute.agreement));
    assert.ok(!translateTag('es', `Slight ${attribute.name}`).includes('undefined'));
    assert.ok(CATEGORY_COLORS[attribute.category]);
  }
  assert.equal(translateTag('es', 'Slight Apple'), 'Ligera Manzana');
  assert.equal(translateTag('es', 'Intense Sweet Aromatics'), 'Intensos Aromas Dulces');
  assert.equal(translateTag('es', 'Winey'), 'Vinoso');
  assert.equal(translateTag('es', 'Quaker'), 'Quaker');
});

test('negative and positive WCR assignments cover the full list', () => {
  const positive = Object.values(LEXICON_OPTIONS.wcr.positive).flat();
  const negative = Object.values(LEXICON_OPTIONS.wcr.negative).flat();
  assert.deepEqual([...positive, ...negative].sort(), [...indexedNames].sort());
  assert.ok(negative.includes('Winey'));
  assert.ok(positive.includes('Nutty'));
  assert.ok(Object.values(LEXICON_OPTIONS.osito.negative).flat().includes('Nutty'));
});

test('CSV preserves selected lexicon and mixed tags without altering session data', async (t) => {
  let csvBlob;
  const link = { click() {}, remove() {} };
  t.mock.method(URL, 'createObjectURL', (blob) => { csvBlob = blob; return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => link, body: { appendChild() {} } };
  t.after(() => { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; });
  t.mock.method(globalThis, 'setTimeout', (callback) => { callback(); return 0; });
  const samples = initializeSamples(2);
  samples[0].notes.inCupTags = ['Slight Apple', 'Yellow Fruit'];
  samples[0].notes.negativeTags = ['Intense Papery', 'Quaker'];
  for (const mode of ['osito', 'wcr', 'both']) {
    downloadCSV(samples, '2026-09-25', 'Test', mode);
    const imported = importSessionFromCSV(await csvBlob.text(), 'Test.csv');
    assert.equal(imported.lexiconMode, mode);
    assert.deepEqual(imported.samples[0].notes, samples[0].notes);
    assert.equal(imported.samples.length, 2);
  }
});

test('older CSVs and unknown settings default to Osito', () => {
  assert.equal(importSessionFromCSV('Sample #,Processing\n1,Washed', 'Old.csv').lexiconMode, 'osito');
  assert.equal(normalizeLexiconMode(undefined), 'osito');
  assert.equal(normalizeLexiconMode('unknown'), 'osito');
});
