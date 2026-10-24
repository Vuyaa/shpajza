const { convertQuantity } = require('./units');

const normalizeName = (value = '') => value.trim().toLowerCase();

const buildInventoryMap = (inventoryItems = []) => {
  const map = new Map();

  for (const item of inventoryItems) {
    const key = normalizeName(item.name);
    map.set(key, [...(map.get(key) || []), item]);
  }

  return map;
};

const getAvailableQuantity = (items = [], unit) =>
  items.reduce((sum, item) => {
    const converted = convertQuantity(item.quantity, item.unit, unit);
    return sum + (Number.isFinite(converted) ? converted : 0);
  }, 0);

const findMatchingRecipes = (inventoryItems = [], recipes = []) => {
  const inventoryMap = buildInventoryMap(inventoryItems);

  return recipes.map((recipe) => {
    const missingIngredients = [];
    let canMake = true;

    for (const ingredient of recipe.ingredients) {
      const key = normalizeName(ingredient.name);
      const items = inventoryMap.get(key);

      if (!items) {
        canMake = false;
        missingIngredients.push({
          name: ingredient.name,
          required: ingredient.quantity,
          unit: ingredient.unit,
          available: 0,
        });
        continue;
      }

      const availableQuantity = getAvailableQuantity(items, ingredient.unit);

      if (availableQuantity < ingredient.quantity) {
        canMake = false;
        missingIngredients.push({
          name: ingredient.name,
          required: ingredient.quantity,
          unit: ingredient.unit,
          available: availableQuantity,
        });
      }
    }

    return {
      recipeId: recipe.id,
      name: recipe.name,
      description: recipe.description,
      canMake,
      missingIngredients,
      missingCount: missingIngredients.length,
    };
  });
};

module.exports = {
  findMatchingRecipes,
};
