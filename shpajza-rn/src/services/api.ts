import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  AiSuggestion,
  AiMode,
  AppSettings,
  InventoryItem,
  Recipe,
  RecipeIngredient,
  RecipeMatch,
  User
} from '../types';

export const STORAGE_KEYS = {
  auth: 'shpajza:auth',
  user: 'shpajza:user',
  settings: 'shpajza:settings'
};

const devHost = Platform.OS === 'web' ? undefined : Constants.expoConfig?.hostUri?.split(':')[0];

export const API_BASE = `http://${devHost ?? 'localhost'}:4000`;

export const UNITS = ['kom', 'g', 'kg', 'l', 'ml', 'pak', 'kutija', 'karton'];

export const defaultSettings: AppSettings = {
  defaultUnit: 'kom',
  remindersEnabled: true,
  lowStockAlert: true,
  theme: 'light'
};

export class AuthError extends Error {}

export async function saveUser(user: User | null) {
  if (!user) {
    await AsyncStorage.removeItem(STORAGE_KEYS.user);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

export async function getUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.user);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveAuthToken(token: string | null) {
  if (!token) {
    await AsyncStorage.removeItem(STORAGE_KEYS.auth);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.auth, token);
}

export async function getAuthToken() {
  return AsyncStorage.getItem(STORAGE_KEYS.auth);
}

export async function requestJson(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  const message = typeof payload === 'string' ? payload : payload?.message;

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(message || 'Sesija je istekla. Prijavite se ponovno.');
  }

  if (!response.ok) {
    throw new Error(message || 'Request failed.');
  }

  return payload;
}

export async function login(email: string, password: string) {
  const payload = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  await saveAuthToken(payload.token || null);
  await saveUser(payload.user || null);
  return payload;
}

export async function register(name: string, email: string, password: string) {
  const payload = await requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
  await saveAuthToken(payload.token || null);
  await saveUser(payload.user || null);
  return payload;
}

export async function loadInventory(): Promise<InventoryItem[]> {
  const response = await requestJson('/api/inventory');
  return (response.items || []).map((item: any) => ({
    id: String(item.id),
    name: item.name,
    quantity: Number(item.quantity ?? 0),
    unit: item.unit || 'kom',
    expiryDate: item.expiryDate || null,
    frozen: Boolean(item.frozen)
  }));
}

export async function createInventoryItem(item: {
  name: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  frozen?: boolean;
}) {
  return requestJson('/api/inventory', { method: 'POST', body: JSON.stringify(item) });
}

export async function updateInventoryFrozen(id: string, frozen: boolean) {
  return requestJson(`/api/inventory/${id}`, { method: 'PATCH', body: JSON.stringify({ frozen }) });
}

export async function updateInventoryQuantity(id: string, quantity: number) {
  return requestJson(`/api/inventory/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
}

export async function deleteInventoryItem(id: string) {
  return requestJson(`/api/inventory/${id}`, { method: 'DELETE' });
}

export async function loadRecipes(): Promise<Recipe[]> {
  const response = await requestJson('/api/recipes');
  return (response.recipes || []).map((recipe: any) => ({
    id: String(recipe.id),
    name: recipe.name,
    description: recipe.description || 'Opis recepta',
    editable: Boolean(recipe.userId),
    ingredients: (recipe.ingredients || []).map((ingredient: any) => ({
      name: ingredient.name || 'Sastojak',
      quantity: Number(ingredient.quantity ?? 1),
      unit: ingredient.unit || ''
    }))
  }));
}

export async function createRecipe(recipe: {
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
}) {
  return requestJson('/api/recipes', { method: 'POST', body: JSON.stringify(recipe) });
}

export async function updateRecipe(
  id: string,
  recipe: { name: string; description: string; ingredients: RecipeIngredient[] }
) {
  return requestJson(`/api/recipes/${id}`, { method: 'PUT', body: JSON.stringify(recipe) });
}

export async function deleteRecipe(id: string) {
  return requestJson(`/api/recipes/${id}`, { method: 'DELETE' });
}

export async function useRecipe(id: string) {
  return requestJson(`/api/recipes/${id}/use`, { method: 'POST' });
}

export async function loadMatches(): Promise<RecipeMatch[]> {
  const response = await requestJson('/api/recipes/match');
  return response.matches || [];
}

export async function fetchAiSuggestion(
  options: { mode?: AiMode; avoidTitle?: string } = {}
): Promise<AiSuggestion | null> {
  const response = await requestJson('/api/recipes/ai-suggest', {
    method: 'POST',
    body: JSON.stringify(options)
  });
  return response.suggestion || null;
}

export async function loadCachedSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
  try {
    return { ...defaultSettings, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return defaultSettings;
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const response = await requestJson('/api/settings');
    const settings = { ...defaultSettings, ...(response.settings || {}) };
    await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    return settings;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    return loadCachedSettings();
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));

  try {
    const response = await requestJson('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    return { ...defaultSettings, ...(response.settings || settings) };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    return settings;
  }
}
