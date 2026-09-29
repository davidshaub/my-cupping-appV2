import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORISED_LEXICON, NEGATIVE_LEXICON } from '../src/constants.js';
import { WCR_ATTRIBUTES } from '../src/lib/lexicon.js';
import { TAG_MODIFIER_GRAMMAR, nextTagModifier, canModifyTag } from '../src/lib/tagModifiers.js';
import { translateTag } from '../src/i18n.js';

test('every Osito and WCR descriptor has an explicit modifier grammar review', () => {
  const catalog = [...Object.values(CATEGORISED_LEXICON).flat(), ...NEGATIVE_LEXICON, ...WCR_ATTRIBUTES.map(entry => entry.name)];
  for (const name of catalog) assert.ok(TAG_MODIFIER_GRAMMAR[name], `Review Slight/Slightly and Intense/Intensely for new descriptor: ${name}`);
  for (const name of Object.keys(TAG_MODIFIER_GRAMMAR)) assert.ok(catalog.includes(name), `Stale grammar entry: ${name}`);
});

test('noun and adjective displays use the correct forms for both modifiers', () => {
  for (const noun of ['Chocolate', 'Citrus', 'Nuts', 'Acetic Acid']) {
    assert.equal(translateTag('en', `Slight ${noun}`), `Slight ${noun}`);
    assert.equal(translateTag('en', `Intense ${noun}`), `Intense ${noun}`);
  }
  for (const adjective of ['Floral', 'Fruity', 'Earthy', 'Nutty', 'Acetic']) {
    assert.equal(translateTag('en', `Slight ${adjective}`), `Slightly ${adjective}`);
    assert.equal(translateTag('en', `Intense ${adjective}`), `Intensely ${adjective}`);
  }
});

test('cycling keeps legacy storage spelling, and Good Sweetness cannot cycle', () => {
  assert.equal(nextTagModifier('Floral'), 'Slight Floral');
  assert.equal(nextTagModifier('Slight Floral'), 'Intense Floral');
  assert.equal(nextTagModifier('Intense Floral'), 'Floral');
  for (const tag of ['Good Sweetness', 'Slight Good Sweetness', 'Intense Good Sweetness']) {
    assert.equal(canModifyTag(tag), false);
    assert.equal(nextTagModifier(tag), tag);
    assert.equal(translateTag('en', tag), 'Good Sweetness');
    assert.equal(translateTag('es', tag), translateTag('es', 'Good Sweetness'));
  }
});

test('Spanish agreement and undecided compound phrases retain their existing forms', () => {
  assert.equal(translateTag('es', 'Slight Raspberry'), 'Ligera Frambuesa');
  assert.equal(translateTag('es', 'Intense Raspberry'), 'Intensa Frambuesa');
  assert.equal(translateTag('en', 'Slight Dusty/Concrete'), 'Slight Dusty/Concrete');
});
