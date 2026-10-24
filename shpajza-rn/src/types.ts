export type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  frozen?: boolean;
}; 

export type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

export type Recipe = {
  id: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  editable: boolean;
};

export type RecipeMatch = {
  recipeId: string;
  canMake: boolean;
  missingIngredients: { name: string; required: number; unit: string; available: number }[];
};

export type AiMode = 'healthy' | 'quick' | 'full';

export type AiSuggestion = {
  title?: string;
  description?: string;
  ingredients?: (RecipeIngredient & { kcal?: number })[];
  instructions?: string;
  confidence?: number;
  reason?: string;
  servings?: number;
  totalKcal?: number;
  kcalPerServing?: number;
};

export type AppSettings = {
  defaultUnit: string;
  remindersEnabled: boolean;
  lowStockAlert: boolean;
  theme: 'light' | 'dark';
};

export type User = { id?: string; name?: string; email?: string };
