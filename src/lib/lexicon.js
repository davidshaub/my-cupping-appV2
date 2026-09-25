import { CATEGORISED_LEXICON, NEGATIVE_LEXICON } from '../constants.js';

// Attribute names and sections: WCR Sensory Lexicon 2.0 (2017), pp. 14-54.
// https://worldcoffeeresearch.org/resources/sensory-lexicon
// Spanish labels and positive/negative assignments are app editorial choices.
// Each tuple contains the English name, Spanish label, and Spanish agreement.
const WCR_GROUPS = {
  'Taste Basics': [
    ['Sweet', 'Dulce', 'ms'], ['Sour', 'Agrio', 'ms'],
    ['Bitter', 'Amargo', 'ms'], ['Salty', 'Salado', 'ms']
  ],
  Fruity: [
    ['Fruity', 'Frutal', 'ms'], ['Berry', 'Bayas', 'fp'],
    ['Strawberry', 'Fresa', 'fs'], ['Raspberry', 'Frambuesa', 'fs'],
    ['Blueberry', 'Arándano', 'ms'], ['Blackberry', 'Mora', 'fs'],
    ['Dried Fruit', 'Fruta Seca', 'fs'], ['Raisin', 'Pasa', 'fs'],
    ['Prune', 'Ciruela Pasa', 'fs'], ['Other Fruit', 'Otras Frutas', 'fp'],
    ['Apple', 'Manzana', 'fs'], ['Pear', 'Pera', 'fs'], ['Peach', 'Durazno', 'ms'],
    ['Grape', 'Uva', 'fs'], ['Cherry', 'Cereza', 'fs'], ['Pomegranate', 'Granada', 'fs'],
    ['Coconut', 'Coco', 'ms'], ['Pineapple', 'Piña', 'fs'],
    ['Citrus Fruit', 'Fruta Cítrica', 'fs'], ['Lemon', 'Limón', 'ms'],
    ['Grapefruit', 'Toronja', 'fs'], ['Orange', 'Naranja', 'fs'], ['Lime', 'Lima', 'fs']
  ],
  'Sour/Acid': [
    ['Sour Aromatics', 'Aromas Agrios', 'mp'], ['Acetic Acid', 'Ácido Acético', 'ms'],
    ['Butyric Acid', 'Ácido Butírico', 'ms'], ['Isovaleric Acid', 'Ácido Isovalérico', 'ms'],
    ['Citric Acid', 'Ácido Cítrico', 'ms'], ['Malic Acid', 'Ácido Málico', 'ms']
  ],
  'Alcohol/Fermented': [
    ['Alcohol', 'Alcohol', 'ms'], ['Whiskey', 'Whisky', 'ms'], ['Winey', 'Vinoso', 'ms'],
    ['Fermented', 'Fermentado', 'ms'], ['Overripe/Near Fermented', 'Sobremaduro/Casi Fermentado', 'ms']
  ],
  'Green/Vegetative': [
    ['Olive Oil', 'Aceite de Oliva', 'ms'], ['Raw', 'Crudo', 'ms'],
    ['Under-ripe', 'Inmaduro', 'ms'], ['Peapod', 'Vaina de Guisante', 'fs'],
    ['Green', 'Verde', 'ms'], ['Fresh', 'Fresco', 'ms'], ['Dark Green', 'Verde Oscuro', 'ms'],
    ['Vegetative', 'Vegetal', 'ms'], ['Hay-like', 'Heno', 'ms'],
    ['Herb-like', 'Herbal', 'ms'], ['Beany', 'Legumbre', 'fs']
  ],
  'Stale/Papery': [
    ['Stale', 'Envejecido', 'ms'], ['Papery', 'Papel', 'ms'], ['Cardboard', 'Cartón', 'ms']
  ],
  Earthy: [
    ['Musty/Earthy', 'Mohoso/Terroso', 'ms'], ['Musty/Dusty', 'Mohoso/Polvoriento', 'ms'],
    ['Moldy/Damp', 'Moho/Humedad', 'ms'], ['Phenolic', 'Fenólico', 'ms'],
    ['Animalic', 'Animal', 'ms'], ['Meaty/Brothy', 'Carne/Caldo', 'ms'], ['Woody', 'Madera', 'fs']
  ],
  Chemical: [
    ['Medicinal', 'Medicinal', 'ms'], ['Rubber', 'Caucho', 'ms'],
    ['Petroleum', 'Petróleo', 'ms'], ['Skunky', 'Olor a Mofeta', 'ms']
  ],
  Roasted: [
    ['Tobacco', 'Tabaco', 'ms'], ['Pipe Tobacco', 'Tabaco de Pipa', 'ms'],
    ['Acrid', 'Acre', 'ms'], ['Ashy', 'Ceniza', 'fs'], ['Burnt', 'Quemado', 'ms'],
    ['Smoky', 'Ahumado', 'ms'], ['Roasted', 'Tostado', 'ms'], ['Brown, Roast', 'Tostado Marrón', 'ms']
  ],
  Cereal: [['Grain', 'Grano de Cereal', 'ms'], ['Malt', 'Malta', 'fs']],
  Spices: [
    ['Pungent', 'Pungente', 'ms'], ['Pepper', 'Pimienta', 'fs'], ['Anise', 'Anís', 'ms'],
    ['Nutmeg', 'Nuez Moscada', 'fs'], ['Brown Spice', 'Especias Marrones', 'fp'],
    ['Cinnamon', 'Canela', 'fs'], ['Clove', 'Clavo de Olor', 'ms']
  ],
  Nutty: [
    ['Nutty', 'Nuez', 'fs'], ['Almond', 'Almendra', 'fs'],
    ['Hazelnut', 'Avellana', 'fs'], ['Peanuts', 'Maní', 'ms']
  ],
  Cocoa: [
    ['Chocolate', 'Chocolate', 'ms'], ['Cocoa', 'Cacao', 'ms'], ['Dark Chocolate', 'Chocolate Oscuro', 'ms']
  ],
  Sweet: [
    ['Molasses', 'Melaza', 'fs'], ['Maple Syrup', 'Jarabe de Arce', 'ms'],
    ['Brown Sugar', 'Azúcar Morena', 'ms'], ['Caramelized', 'Caramelizado', 'ms'],
    ['Honey', 'Miel', 'fs'], ['Vanilla', 'Vainilla', 'fs'], ['Vanillin', 'Vainillina', 'fs'],
    ['Sweet Aromatics', 'Aromas Dulces', 'mp'], ['Overall Sweet', 'Dulzor General', 'ms']
  ],
  Floral: [
    ['Floral', 'Floral', 'ms'], ['Rose', 'Rosa', 'fs'], ['Jasmine', 'Jazmín', 'ms'],
    ['Chamomile', 'Manzanilla', 'fs'], ['Black Tea', 'Té Negro', 'ms']
  ],
  Amplitude: [
    ['Overall Impact', 'Impacto General', 'ms'], ['Blended', 'Integrado', 'ms'],
    ['Longevity', 'Persistencia', 'fs'], ['Body/Fullness', 'Cuerpo/Plenitud', 'ms']
  ],
  Mouthfeel: [
    ['Mouth Drying', 'Sequedad Bucal', 'fs'], ['Thickness', 'Espesor', 'ms'],
    ['Metallic', 'Metálico', 'ms'], ['Oily', 'Aceitoso', 'ms']
  ]
};

const WCR_NEGATIVE = new Set([
  'Sour', 'Bitter', 'Salty', 'Sour Aromatics', 'Acetic Acid', 'Butyric Acid', 'Isovaleric Acid',
  'Alcohol', 'Whiskey', 'Winey', 'Fermented', 'Overripe/Near Fermented',
  'Raw', 'Under-ripe', 'Peapod', 'Green', 'Dark Green', 'Vegetative', 'Hay-like', 'Beany',
  'Stale', 'Papery', 'Cardboard', 'Musty/Earthy', 'Musty/Dusty', 'Moldy/Damp',
  'Phenolic', 'Animalic', 'Meaty/Brothy', 'Woody', 'Medicinal', 'Rubber', 'Petroleum', 'Skunky',
  'Acrid', 'Ashy', 'Burnt', 'Smoky', 'Pungent', 'Pepper', 'Mouth Drying', 'Metallic'
]);

export const WCR_ATTRIBUTES = Object.entries(WCR_GROUPS).flatMap(([category, entries]) =>
  entries.map(([name, spanish, agreement]) => ({ name, spanish, agreement, category, negative: WCR_NEGATIVE.has(name) }))
);

// Keep existing stored labels intact; only use aliases to match equivalent suggestions.
const ALIASES = {
  Berries: 'Berry', Citrus: 'Citrus Fruit', Herbal: 'Herb-like',
  Acetic: 'Acetic Acid', Butyric: 'Butyric Acid', Paper: 'Papery',
  Vegetal: 'Vegetative', Wood: 'Woody', Rubbery: 'Rubber', Phenol: 'Phenolic',
  Nuts: 'Nutty', Drying: 'Mouth Drying'
};

export const canonicalTag = (tag) => {
  const base = tag.replace(/^(Slight|Intense) /, '');
  return ALIASES[base] ?? base;
};

const OSITO_CATEGORY_OVERRIDES = {
  Fruity: ['Citrus', 'Orange', 'Pulpy Citrus', 'Bergamot', 'Brown Fruit: Raisin/Date', 'Dried Apricot', 'Artificial Grape'],
  'Green/Vegetative': ['Hops', 'Herbal', 'Sweet Hay', 'Mint', 'Tomato', 'Potato', 'Vegetal', 'Onion', 'Olive Brine'],
  Sweet: ['Bubblegum'],
  Roasted: ['Pipe Tobacco'],
  Cereal: ['Graham Cracker', 'Wafer Cookie', 'Starchy', 'Popcorn'],
  Spices: ['Licorice', 'Pepper'],
  Nutty: ['Nuts', 'Almond', 'Hazelnut', 'Nutty'],
  Cocoa: ['Chocolate'],
  Earthy: ['Terracotta', 'Earthy', 'Dusty/Concrete', 'Wood', 'Phenol', 'Leather'],
  'Sour/Acid': ['Lactic', 'Tartaric', 'Phosphoric', 'Acetic', 'Butyric'],
  'Alcohol/Fermented': ['Boozy', 'Winey', 'Off Ferment Character'],
  'Stale/Papery': ['Age', 'Paper'],
  Chemical: ['Medicinal', 'Rubbery', 'Artificial/Process'],
  Mouthfeel: ['Astringent', 'Drying', 'Thin', 'Pulpy'],
  'Osito-specific': ['Balanced', 'Nice Structure', 'Flabby', 'Hard Cups', 'Harsh Finish', 'Lacking', 'Quaker', 'Unclean', 'Cloying', 'Muddled', 'Flat/Lacking', 'Unclean Finish']
};

const ositoCategories = new Map(Object.entries(CATEGORISED_LEXICON).flatMap(([category, tags]) => tags.map((tag) => [tag, category])));
Object.entries(OSITO_CATEGORY_OVERRIDES).forEach(([category, tags]) => tags.forEach((tag) => ositoCategories.set(tag, category)));
const wcrByName = new Map(WCR_ATTRIBUTES.map((attribute) => [attribute.name, attribute]));

export const LEXICON_CATEGORIES = [...Object.keys(WCR_GROUPS), 'Osito-specific'];
export const normalizeLexiconMode = (mode) => ['osito', 'wcr', 'both'].includes(mode) ? mode : 'osito';

export const categoryForTag = (tag) => {
  const base = tag.replace(/^(Slight|Intense) /, '');
  return ositoCategories.get(base) ?? wcrByName.get(canonicalTag(base))?.category ??
    ({ Citrus: 'Fruity', 'Nutty/Cocoa': 'Nutty', Structure: 'Osito-specific' })[base] ??
    (LEXICON_CATEGORIES.includes(base) ? base : null);
};

const groupTags = (tags) => {
  const grouped = Object.fromEntries(LEXICON_CATEGORIES.map((category) => [category, []]));
  tags.forEach((tag) => grouped[categoryForTag(tag) ?? 'Osito-specific'].push(tag));
  return Object.fromEntries(Object.entries(grouped).filter(([, entries]) => entries.length));
};

const ositoPositive = Object.values(CATEGORISED_LEXICON).flat();
const combine = (osito, wcr) => {
  const seen = new Set(osito.map(canonicalTag));
  return [...osito, ...wcr.filter((tag) => !seen.has(canonicalTag(tag)))];
};

export const LEXICON_OPTIONS = Object.fromEntries(['osito', 'wcr', 'both'].map((mode) => {
  const wcrPositive = WCR_ATTRIBUTES.filter((attribute) => !attribute.negative).map((attribute) => attribute.name);
  const wcrNegative = WCR_ATTRIBUTES.filter((attribute) => attribute.negative).map((attribute) => attribute.name);
  return [mode, {
    positive: groupTags(mode === 'osito' ? ositoPositive : mode === 'wcr' ? wcrPositive : combine(ositoPositive, wcrPositive)),
    negative: groupTags(mode === 'osito' ? NEGATIVE_LEXICON : mode === 'wcr' ? wcrNegative : combine(NEGATIVE_LEXICON, wcrNegative))
  }];
}));

export const tagSearchText = (tag) => [tag, canonicalTag(tag), ...Object.keys(ALIASES).filter((alias) => ALIASES[alias] === canonicalTag(tag))].join(' ');
