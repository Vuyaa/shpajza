import { InventoryItem, Recipe, RecipeIngredient } from './types';

export type ExpiryStatus = 'good' | 'warning' | 'danger';

export function getExpiryState(expiryDate: string | null): { text: string; status: ExpiryStatus } {
  if (!expiryDate) {
    return { text: 'Bez roka', status: 'good' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { text: 'Isteklo', status: 'danger' };
  }
  if (diffDays === 0) {
    return { text: 'Ističe danas', status: 'danger' };
  }
  if (diffDays <= 2) {
    return { text: `Ističe za ${diffDays} dan${diffDays === 1 ? '' : 'a'}`, status: 'danger' };
  }
  return { text: `Ističe za ${diffDays} dana`, status: diffDays <= 5 ? 'warning' : 'good' };
}

export function formatIngredient(ingredient: RecipeIngredient) {
  return `${ingredient.name} ${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ''}`;
}

export function formatQuantity(item: InventoryItem) {
  return `${item.quantity} ${item.unit}`;
}

export function normalizeRecipeDescription(summary = '', instructions = '') {
  const cleanedSummary = summary.replace(/\r/g, '').trim();
  const cleanedInstructions = instructions.replace(/\r/g, '').trim();

  if (!cleanedSummary && !cleanedInstructions) return 'Opis recepta';
  if (!cleanedSummary) return cleanedInstructions;
  if (!cleanedInstructions) return cleanedSummary;
  return `${cleanedSummary}\n\n${cleanedInstructions}`;
}

export function splitRecipeDescription(description = '') {
  const cleaned = description.replace(/\r/g, '').trim();
  if (!cleaned) return { summary: 'Opis recepta', instructions: '' };

  const parts = cleaned.split(/\n\s*\n/);
  const summary = (parts.shift() || '').trim() || 'Opis recepta';
  return { summary, instructions: parts.join('\n\n').trim() };
}

export function buildRecipeShareText(recipe: Pick<Recipe, 'name' | 'description'>) {
  const { summary, instructions } = splitRecipeDescription(recipe.description);
  const summaryText = summary !== 'Opis recepta' ? summary : 'Dijelimo recept.';
  return instructions
    ? `${recipe.name}\n\n${summaryText}\n\nUpute:\n${instructions}`
    : `${recipe.name}\n\n${summaryText}`;
}
