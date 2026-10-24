(function (global) {
  const normalizeRecipeDescription = (summary = '', instructions = '') => {
    const cleanedSummary = String(summary || '').replace(/\r/g, '').trim();
    const cleanedInstructions = String(instructions || '').replace(/\r/g, '').trim();

    if (!cleanedSummary && !cleanedInstructions) {
      return 'Opis recepta';
    }

    if (!cleanedSummary) {
      return cleanedInstructions;
    }

    if (!cleanedInstructions) {
      return cleanedSummary;
    }

    return `${cleanedSummary}\n\n${cleanedInstructions}`;
  };

  const splitRecipeDescription = (description = '') => {
    const cleaned = String(description || '').replace(/\r/g, '').trim();

    if (!cleaned) {
      return { summary: 'Opis recepta', instructions: '' };
    }

    const parts = cleaned.split(/\n\s*\n/);
    const summary = String(parts.shift() || '').trim() || 'Opis recepta';
    const instructions = parts.join('\n\n').trim();

    return {
      summary,
      instructions,
    };
  };

  const buildRecipeShareText = (recipe = {}) => {
    const { summary, instructions } = splitRecipeDescription(recipe.description || '');
    const recipeName = recipe.name || 'Recept';
    const summaryText = summary && summary !== 'Opis recepta' ? summary : 'Dijelimo recept.';

    if (!instructions) {
      return `${recipeName}\n\n${summaryText}`;
    }

    return `${recipeName}\n\n${summaryText}\n\nUpute:\n${instructions}`;
  };

  const api = {
    normalizeRecipeDescription,
    splitRecipeDescription,
    buildRecipeShareText,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.ShpajzaRecipeUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
