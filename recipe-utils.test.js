const assert = require('node:assert/strict');
const { buildRecipeShareText, normalizeRecipeDescription } = require('./recipe-utils');

const recipe = {
  name: 'Pita od jabuka',
  description: 'Kratki opis recepta.\n\n1. Narežite jabuke.\n2. Stavite u tijesto.\n3. Pecite 40 minuta.',
};

assert.match(buildRecipeShareText(recipe), /Pita od jabuka/);
assert.match(buildRecipeShareText(recipe), /Kratki opis recepta/);
assert.match(buildRecipeShareText(recipe), /Narežite jabuke/);
assert.equal(normalizeRecipeDescription('Kratki opis', '1. Narežite jabuke.\n2. Pecite 40 minuta.'), 'Kratki opis\n\n1. Narežite jabuke.\n2. Pecite 40 minuta.');

console.log('recipe utils test passed');
