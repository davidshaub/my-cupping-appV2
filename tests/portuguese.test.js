import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_TEXT, nextLanguage, normalizeLanguage, translateTag, translateCategory, translateScoreLabel, translateRadarLabel, translateProcessing, translateLevel, matchesTagSearch } from '../src/i18n.js';
import { TAGS_PT, CATEGORIES_PT, SCORE_PT, RADAR_PT } from '../src/locales/pt-BR.js';
import { CATEGORISED_LEXICON, NEGATIVE_LEXICON, CATEGORIES, RADAR_LABELS } from '../src/constants.js';
import { WCR_ATTRIBUTES, LEXICON_CATEGORIES } from '../src/lib/lexicon.js';
import { wheelProvenance } from '../src/lib/flavorWheel.js';

test('language cycle and persisted preference include Brazilian Portuguese', () => {
  assert.equal(nextLanguage('en'), 'es');
  assert.equal(nextLanguage('es'), 'pt-BR');
  assert.equal(nextLanguage('pt-BR'), 'en');
  assert.equal(normalizeLanguage('pt-BR'), 'pt-BR');
  assert.equal(normalizeLanguage(null), 'en');
});

test('Portuguese covers every UI key, catalog entry, category and chart label explicitly', () => {
  assert.deepEqual(Object.keys(UI_TEXT['pt-BR']).sort(), Object.keys(UI_TEXT.en).sort());
  const names = [...Object.values(CATEGORISED_LEXICON).flat(), ...NEGATIVE_LEXICON, ...WCR_ATTRIBUTES.map(entry => entry.name)];
  for (const name of names) {
    assert.ok(TAGS_PT[name]?.[0], name);
    assert.ok(['adj','ms','fs','mp','fp'].includes(TAGS_PT[name][1]), name);
    for (const prefix of ['', 'Slight ', 'Intense ']) assert.ok(!translateTag('pt-BR', prefix + name).includes('undefined'), name);
  }
  for (const category of LEXICON_CATEGORIES) assert.equal(translateCategory('pt-BR', category), CATEGORIES_PT[category]);
  for (const {id} of CATEGORIES) assert.equal(translateScoreLabel('pt-BR', id), SCORE_PT[id]);
  for (const label of RADAR_LABELS) assert.equal(translateRadarLabel('pt-BR', label), RADAR_PT[label]);
});

test('Portuguese uses noun agreement, adverbs and the approved special cycles', () => {
  assert.equal(translateTag('pt-BR', 'Slight Raspberry'), 'Leve Framboesa');
  assert.equal(translateTag('pt-BR', 'Intense Raspberry'), 'Intensa Framboesa');
  assert.equal(translateTag('pt-BR', 'Intense Red Fruit'), 'Intensas Frutas Vermelhas');
  assert.equal(translateTag('pt-BR', 'Slight Floral'), 'Levemente Floral');
  assert.equal(translateTag('pt-BR', 'Intense Floral'), 'Intensamente Floral');
  assert.equal(translateTag('pt-BR', 'Intense Harsh Finish'), 'Finalização Muito Áspera');
  assert.equal(translateTag('pt-BR', 'Intense Good Sweetness'), 'Boa Doçura');
  assert.equal(translateTag('pt-BR', 'Intense Flat/Lacking'), 'Leve Falta de Vivacidade');
  assert.equal(translateTag('pt-BR', 'Quaker'), 'Quaker');
});

test('Portuguese search works without accents and report helper text is localized', () => {
  assert.ok(matchesTagSearch('pt-BR', 'Brown Sugar', 'acucar'));
  assert.ok(matchesTagSearch('pt-BR', 'Pineapple', 'abacaxi'));
  assert.ok(matchesTagSearch('pt-BR', 'Pineapple', 'pineapple'));
  assert.equal(translateProcessing('pt-BR', 'Washed'), 'Lavado');
  assert.equal(translateLevel('pt-BR', 'Med+'), 'Médio+');
  assert.equal(wheelProvenance({aroma:true,cup:true}, 'pt-BR'), 'Aroma + xícara');
  assert.equal(translateTag('pt-BR', 'An unknown historic tag'), 'An unknown historic tag');
});
