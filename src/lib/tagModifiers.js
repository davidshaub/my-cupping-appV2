// Every catalog addition needs an explicit grammar review; coverage is tested.
const nouns = [
  'Acetic Acid', 'Age', 'Alcohol', 'Almond', 'Anise', 'Apple', 'Artificial Grape',
  'Baking Spices', 'Bergamot', 'Berries', 'Berry', 'Black Tea', 'Blackberry', 'Blueberry',
  'Body/Fullness', 'Brown Fruit: Raisin/Date', 'Brown Spice', 'Brown Sugar', 'Browning Sugars',
  'Bubblegum', 'Butyric Acid', 'Caramel', 'Cardboard', 'Chamomile', 'Cherry', 'Chocolate',
  'Cinnamon', 'Citric Acid', 'Citrus', 'Citrus Fruit', 'Clove', 'Cocoa', 'Coconut', 'Cola',
  'Cooked Fruit', 'Dark Berries', 'Dark Chocolate', 'Dried Apricot', 'Dried Banana', 'Dried Fruit',
  'Graham Cracker', 'Grain', 'Grape', 'Grapefruit', 'Hard Cups', 'Harsh Finish', 'Hazelnut',
  'Honey', 'Hops', 'Isovaleric Acid', 'Jasmine', 'Leather', 'Lemon', 'Licorice', 'Lime',
  'Longevity', 'Lychee', 'Malic Acid', 'Malt', 'Maple Syrup', 'Melon', 'Mint', 'Molasses',
  'Nice Structure', 'Nougat', 'Nutmeg', 'Nuts', 'Off Ferment Character', 'Olive Brine',
  'Olive Oil', 'Onion', 'Orange', 'Orchard Fruit (Apple, Pear)', 'Other Fruit', 'Overall Impact',
  'Panela', 'Paper', 'Peach', 'Peanuts', 'Peapod', 'Pear', 'Pepper', 'Petroleum', 'Phenol',
  'Pineapple', 'Pipe Tobacco', 'Plum', 'Pomegranate', 'Popcorn', 'Potato', 'Prune',
  'Pulpy Citrus', 'Quaker', 'Raisin', 'Raspberry', 'Red Currant', 'Red Fruit', 'Rose',
  'Rubber', 'Sour Aromatics', 'Stone Fruit', 'Strawberry', 'Sugarcane', 'Sweet Aromatics',
  'Sweet Hay', 'Terracotta', 'Thickness', 'Tobacco', 'Tomato', 'Unclean Finish', 'Vanilla',
  'Vanillin', 'Wafer Cookie', 'Whiskey', 'Wood', 'Yellow Fruit'
];
const adjectives = [
  'Acetic', 'Acrid', 'Animalic', 'Ashy', 'Astringent', 'Balanced', 'Beany', 'Bitter',
  'Blended', 'Boozy', 'Burnt', 'Butyric', 'Caramelized', 'Cloying', 'Dark Green', 'Drying',
  'Earthy', 'Fermented', 'Flabby', 'Flat', 'Floral', 'Fresh', 'Fruity', 'Green',
  'Hay-like', 'Herb-like', 'Herbal', 'Jammy', 'Juicy', 'Lacking', 'Lactic', 'Meaty/Brothy',
  'Medicinal', 'Metallic', 'Moldy/Damp', 'Mouth Drying', 'Muddled', 'Musty/Dusty',
  'Musty/Earthy', 'Nutty', 'Oily', 'Overripe/Near Fermented', 'Papery', 'Phenolic',
  'Phosphoric', 'Pulpy', 'Pungent', 'Raw', 'Roasted', 'Rubbery', 'Salty', 'Skunky',
  'Smoky', 'Sour', 'Stale', 'Starchy', 'Sweet', 'Tartaric', 'Thin', 'Tropical',
  'Unclean', 'Under-ripe', 'Vegetal', 'Vegetative', 'Winey', 'Woody'
];

export const TAG_MODIFIER_GRAMMAR = Object.freeze({
  ...Object.fromEntries(nouns.map(name => [name, 'noun'])),
  ...Object.fromEntries(adjectives.map(name => [name, 'adjective'])),
  'Artificial/Process': 'custom',
  'Dusty/Concrete': 'custom',
  'Harsh Finish': 'custom',
  'Unclean Finish': 'custom',
  'Nice Structure': 'locked',
  Balanced: 'locked',
  'Hard Cups': 'locked',
  'Brown, Roast': 'locked',
  'Overall Sweet': 'locked',
  'Good Sweetness': 'locked'
});

export const modifierBase = tag => tag.replace(/^(Slight|Intense) /, '').replace(/^Flat\/Lacking$/, 'Flat');
export const canModifyTag = tag => TAG_MODIFIER_GRAMMAR[modifierBase(tag)] !== 'locked';
export const hasSlightOnly = tag => ['Flat', 'Lacking'].includes(modifierBase(tag));

const CUSTOM_LABELS = {
  'Harsh Finish': ['Slightly Harsh Finish', 'Very Harsh Finish'],
  'Unclean Finish': ['Slightly Unclean Finish', 'Very Unclean Finish'],
  'Dusty/Concrete': ['Slightly Dusty/Concrete-like', 'Intensely Dusty/Concrete-like'],
  'Artificial/Process': ['Slightly Artificial/Process-driven', 'Intensely Artificial/Process-driven']
};

export const nextTagModifier = tag => {
  if (!canModifyTag(tag)) return tag;
  const base = modifierBase(tag);
  if (hasSlightOnly(tag)) return /^(Slight|Intense) /.test(tag) ? base : `Slight ${base}`;
  return tag.startsWith('Slight ') ? `Intense ${base}` : tag.startsWith('Intense ') ? base : `Slight ${base}`;
};

export const englishTagLabel = tag => {
  const base = modifierBase(tag);
  if (!canModifyTag(tag)) return base;
  const modifier = tag.startsWith('Slight ') ? 'Slight' : tag.startsWith('Intense ') ? 'Intense' : '';
  if (!modifier) return base;
  if (hasSlightOnly(tag)) return `Slightly ${base}`;
  if (CUSTOM_LABELS[base]) return CUSTOM_LABELS[base][modifier === 'Slight' ? 0 : 1];
  return `${TAG_MODIFIER_GRAMMAR[base] === 'adjective' ? modifier === 'Slight' ? 'Slightly' : 'Intensely' : modifier} ${base}`;
};
