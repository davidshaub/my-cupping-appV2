export const CATEGORIES = [
  { id: 'fragrance', label: 'Fragrance' },
  { id: 'aroma', label: 'Aroma' },
  { id: 'cleanCup', label: 'Clean Cup' },
  { id: 'sweetness', label: 'Sweetness' },
  { id: 'acidity', label: 'Acidity' },
  { id: 'body', label: 'Body' },
  { id: 'flavor', label: 'Flavor' },
  { id: 'aftertaste', label: 'Aftertaste' },
  { id: 'balance', label: 'Balance' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'overall', label: 'Overall' }
];

export const RADAR_LABELS = [
  'Frag/Aroma',
  'Clean Cup',
  'Sweetness',
  'Acidity',
  'Body',
  'Flavor',
  'Aftertaste',
  'Balance',
  'Consistency',
  'Overall'
];

export const INITIAL_SCORE = 8.5;
export const INCREMENT = 0.25;
export const GRAPH_FLOOR = 7.0;

export const CATEGORISED_LEXICON = {
  Fruity: [
    'Red Fruit',
    'Red Currant',
    'Berries',
    'Dark Berries',
    'Strawberry',
    'Blueberry',
    'Lychee',
    'Cooked Fruit',
    'Melon',
    'Stone Fruit',
    'Orchard Fruit (Apple, Pear)',
    'Grape',
    'Plum',
    'Cherry',
    'Dried Banana',
    'Tomato',
    'Tropical',
    'Jammy',
    'Juicy',
    'Bubblegum'
  ],
  Citrus: ['Citrus', 'Orange', 'Pulpy Citrus'],
  Floral: ['Floral', 'Bergamot', 'Hops', 'Herbal', 'Black Tea'],
  Sweet: [
    'Browning Sugars',
    'Vanilla',
    'Molasses',
    'Caramel',
    'Sugarcane',
    'Panela',
    'Honey',
    'Graham Cracker',
    'Nougat',
    'Cola',
    'Sweet Hay',
    'Pipe Tobacco',
    'Licorice',
    'Good Sweetness',
    'Brown Fruit: Raisin/Date',
    'Dried Apricot'
  ],
  'Nutty/Cocoa': ['Chocolate', 'Nuts', 'Almond', 'Hazelnut', 'Wafer Cookie', 'Terracotta'],
  Spices: ['Baking Spices', 'Cinnamon', 'Mint'],
  Structure: ['Balanced', 'Lactic', 'Tartaric', 'Phosphoric']
};

export const CATEGORY_COLORS = {
  Fruity: '#ef4444',
  Citrus: '#facc15',
  Floral: '#ec4899',
  Sweet: '#f97316',
  'Nutty/Cocoa': '#a8a29e',
  Spices: '#d946ef',
  Structure: '#ef4444'
};

export const NEGATIVE_LEXICON = [
  'Acetic',
  'Age',
  'Astringent',
  'Artificial Grape',
  'Artificial/Process',
  'Earthy',
  'Drying',
  'Flabby',
  'Hard Cups',
  'Harsh Finish',
  'Lacking',
  'Medicinal',
  'Paper',
  'Potato',
  'Quaker',
  'Starchy',
  'Unclean',
  'Vegetal',
  'Pulpy Citrus',
  'Wood',
  'Nutty',
  'Rubbery',
  'Thin',
  'Pulpy',
  'Phenol',
  'Popcorn',
  'Cloying',
  'Onion',
  'Muddled',
  'Boozy',
  'Butyric',
  'Pepper',
  'Flat/Lacking',
  'Winey',
  'Unclean Finish'
];
