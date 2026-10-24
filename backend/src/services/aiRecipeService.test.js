const assert = require('node:assert/strict');
const { buildFallbackSuggestion } = require('./aiRecipeService');

const inventory = [
  { name: 'Jaja', quantity: 4, unit: 'kom' },
  { name: 'Sir', quantity: 150, unit: 'g' },
  { name: 'Rajčica', quantity: 2, unit: 'kom' },
  { name: 'Kruh', quantity: 2, unit: 'kom' },
];

const recipes = [
  {
    id: 'omlet',
    name: 'Omlet',
    description: 'Brzi doručak',
    ingredients: [
      { name: 'Jaja', quantity: 2, unit: 'kom' },
      { name: 'Sir', quantity: 50, unit: 'g' },
    ],
  },
  {
    id: 'salata',
    name: 'Salata od rajčice',
    description: 'Svježa salata',
    ingredients: [
      { name: 'Rajčica', quantity: 2, unit: 'kom' },
      { name: 'Sir', quantity: 30, unit: 'g' },
    ],
  },
];

const suggestion = buildFallbackSuggestion({ inventoryItems: inventory, recipes });

assert.equal(suggestion.title, 'Omlet');
assert.equal(suggestion.source, 'local');
assert.ok(suggestion.confidence > 0);
assert.ok(suggestion.ingredients.length >= 2);

console.log('AI fallback recipe suggestion test passed.');
