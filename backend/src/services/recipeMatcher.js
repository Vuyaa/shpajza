const normalizeName = (value = '') => value.trim().toLowerCase();

const buildInventoryMap = (inventoryItems = []) => {
  const map = new Map();

  for (const item of inventoryItems) {
    const key = normalizeName(item.name);
    const quantity = Number(item.quantity ?? 0);

    const existing = map.get(key);

    map.set(key, {
      ...(existing || item),
      quantity: (existing ? existing.quantity : 0) + (Number.isFinite(quantity) ? quantity : 0),
    });
  }

  return map;
};

const findMatchingRecipes = (inventoryItems = [], recipes = []) => {
  const inventoryMap = buildInventoryMap(inventoryItems);

  return recipes.map((recipe) => {
    const missingIngredients = [];
    let canMake = true;

    for (const ingredient of recipe.ingredients) {
      const key = normalizeName(ingredient.name);
      const available = inventoryMap.get(key);

      if (!available) {
        canMake = false;
        missingIngredients.push({
          name: ingredient.name,
          required: ingredient.quantity,
          unit: ingredient.unit,
          available: 0,
        });
        continue;
      }

      if (available.quantity < ingredient.quantity) {
        canMake = false;
        missingIngredients.push({
          name: ingredient.name,
          required: ingredient.quantity,
          unit: ingredient.unit,
          available: available.quantity,
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
