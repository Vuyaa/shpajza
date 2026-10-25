const recipeUtils = window.ShpajzaRecipeUtils || {};
const normalizeRecipeDescription = recipeUtils.normalizeRecipeDescription || ((summary = '', instructions = '') => {
  const cleanedSummary = String(summary || '').trim();
  const cleanedInstructions = String(instructions || '').trim();
  if (!cleanedSummary && !cleanedInstructions) return 'Opis recepta';
  if (!cleanedSummary) return cleanedInstructions;
  if (!cleanedInstructions) return cleanedSummary;
  return `${cleanedSummary}\n\n${cleanedInstructions}`;
});

const splitRecipeDescription = recipeUtils.splitRecipeDescription || ((description = '') => {
  const cleaned = String(description || '').trim();
  if (!cleaned) return { summary: 'Opis recepta', instructions: '' };
  const parts = cleaned.split(/\n\s*\n/);
  const summary = String(parts.shift() || '').trim() || 'Opis recepta';
  const instructions = parts.join('\n\n').trim();
  return { summary, instructions };
});

const buildRecipeShareText = recipeUtils.buildRecipeShareText || ((recipe = {}) => {
  const { summary, instructions } = splitRecipeDescription(recipe.description || '');
  const recipeName = recipe.name || 'Recept';
  const shareSummary = summary && summary !== 'Opis recepta' ? summary : 'Dijelimo recept.';
  return instructions ? `${recipeName}\n\n${shareSummary}\n\nUpute:\n${instructions}` : `${recipeName}\n\n${shareSummary}`;
});

const resolveApiBase = () => {
  const override = new URLSearchParams(window.location.search).get('apiBase')
    || localStorage.getItem('shpajzaApiBase')
    || '';

  if (override) {
    return override.replace(/\/$/, '');
  }

  const host = window.location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:4000';
  }

  return 'https://shpajza.onrender.com';
};

const API_BASE = resolveApiBase();
const token = localStorage.getItem('shpajzaToken');
const savedUser = JSON.parse(localStorage.getItem('shpajzaUser') || '{}');

if (!token) {
  window.location.replace('auth-view.html');
}

const logoutBtn = document.getElementById('logout-btn');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileLogoutBtn = document.getElementById('profile-logout-btn');
const welcomeName = document.getElementById('welcome-name');

if (welcomeName) {
  welcomeName.textContent = savedUser.name ? `Zdravo, ${savedUser.name}` : 'Zdravo';
}

if (profileName && savedUser.name) {
  profileName.textContent = savedUser.name;
}

if (profileEmail && savedUser.email) {
  profileEmail.textContent = savedUser.email;
}

const SETTINGS_KEY = 'shpajzaSettings';
const defaultSettings = {
  defaultUnit: 'kom',
  remindersEnabled: true,
  lowStockAlert: true,
  theme: 'light'
};

const AI_MODES = [
  { key: 'healthy', label: 'Zdravija hrana' },
  { key: 'quick', label: 'Brzo gotovo' },
  { key: 'full', label: 'Puni slijed jela' }
];

let aiSuggestion = null;
let aiMode = 'healthy';
let aiLoading = false;
let aiSaving = false;
let aiSaved = false;
let aiExpanded = false;

const readSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...defaultSettings, ...saved };
  } catch (error) {
    return { ...defaultSettings };
  }
};

const saveSettings = (nextSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...nextSettings }));
};

const clearAuthSession = () => {
  localStorage.removeItem('shpajzaToken');
  localStorage.removeItem('shpajzaUser');
};

const redirectToAuth = () => {
  clearAuthSession();
  window.location.replace('auth-view.html');
};

const doLogout = () => {
  redirectToAuth();
};

if (logoutBtn) {
  logoutBtn.addEventListener('click', doLogout);
}

if (profileLogoutBtn) {
  profileLogoutBtn.addEventListener('click', doLogout);
}

let inventoryData = [];

let recipeData = [];
let shoppingData = [];

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    clearAuthSession();
    if (window.location.pathname.endsWith('mobile-app.html')) {
      window.location.replace('auth-view.html');
    }
    throw new Error(data.message || 'Sesija je istekla. Prijavite se ponovno.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Došlo je do pogreške. Pokušajte ponovno.');
  }

  return data;
};

const formatCapitalized = (value) => {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getExpiryState = (expiryDate) => {
  if (!expiryDate) {
    return { text: formatCapitalized('bez roka'), status: 'good' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((expiry - today) / 86400000);

  if (diffDays < 0) {
    return { text: formatCapitalized('isteklo'), status: 'danger' };
  }

  if (diffDays <= 2) {
    return { text: formatCapitalized(`ističe za ${diffDays} dan${diffDays === 1 ? '' : 'a'}`), status: 'danger' };
  }

  if (diffDays <= 5) {
    return { text: formatCapitalized(`ističe za ${diffDays} dana`), status: 'warning' };
  }

  return { text: formatCapitalized(`ističe za ${diffDays} dana`), status: 'good' };
};

const loadUserData = async () => {
  try {
    const [inventoryResponse, recipesResponse, settingsResponse, shoppingResponse] = await Promise.all([
      fetchJson(`${API_BASE}/api/inventory`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
      }),
      fetchJson(`${API_BASE}/api/recipes`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
      }),
      fetchJson(`${API_BASE}/api/settings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
      }),
      fetchJson(`${API_BASE}/api/shopping`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
      })
    ]);

    const nextInventory = (inventoryResponse.items || []).map((item) => {
      const expiryState = getExpiryState(item.expiryDate);
      return {
        id: item.id,
        name: item.name,
        quantityValue: Number(item.quantity ?? 0),
        unit: item.unit,
        quantity: `${Number(item.quantity ?? 0)} ${item.unit}`,
        expiry: expiryState.text,
        status: expiryState.status,
      };
    });

    inventoryData = nextInventory;
    recipeData = (recipesResponse.recipes || []).map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description || 'Opis recepta',
      ready: true,
      ingredients: (recipe.ingredients || []).map((ingredient) => {
        const ingredientName = ingredient.name || 'Sastojak';
        const quantity = ingredient.quantity ?? 1;
        const unit = ingredient.unit ? ` ${ingredient.unit}` : '';
        return `${ingredientName} ${quantity}${unit}`;
      })
    }));

    shoppingData = (shoppingResponse.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity ?? 1),
      unit: item.unit || 'kom',
      checked: Boolean(item.checked),
    }));

    if (settingsResponse && settingsResponse.settings) {
      saveSettings(settingsResponse.settings);
      applySettingsToUI();
    }
  } catch (error) {
    console.warn('Backend unavailable; showing empty user state:', error.message);
    inventoryData = [];
    recipeData = [];
    shoppingData = [];
  }

  renderInventory();
  renderRecipes();
  renderMatches();
  renderShopping();
};


const inventoryList = document.getElementById('inventory-list');
const recipesList = document.getElementById('recipes-list');
const matchesList = document.getElementById('matches-list');
const shoppingList = document.getElementById('shopping-list');
const shoppingForm = document.getElementById('shopping-form');
const shoppingNameInput = document.getElementById('shopping-name');
const shoppingQuantityInput = document.getElementById('shopping-quantity');
const shoppingUnitSelect = document.getElementById('shopping-unit');
const moveCheckedBtn = document.getElementById('move-checked-btn');
const inventoryCount = document.getElementById('inventory-count');
const expiringCount = document.getElementById('expiring-count');
const readyCount = document.getElementById('ready-count');
const searchInput = document.querySelector('.search-card input');
const inventoryUnitSelect = document.getElementById('inventory-unit');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const defaultUnitInput = document.getElementById('default-unit');
const reminderToggle = document.getElementById('reminders-enabled');
const lowStockToggle = document.getElementById('low-stock-alert');
const themeSelect = document.getElementById('theme-select');
const refreshMatchesBtn = document.getElementById('refresh-matches-btn');
const aiSuggestBtn = document.getElementById('ai-suggest-btn');
const installAppBtn = document.getElementById('install-app-btn');

const inventoryModal = document.getElementById('inventory-modal');
const inventoryForm = document.getElementById('inventory-form');
const inventoryNameInput = document.getElementById('inventory-name');
const inventoryQuantityInput = document.getElementById('inventory-quantity');
const inventoryExpiryInput = document.getElementById('inventory-expiry');
const closeInventoryModalBtn = document.getElementById('close-inventory-modal');
const cancelInventoryBtn = document.getElementById('cancel-inventory-btn');

const recipeModal = document.getElementById('recipe-modal');
const recipeForm = document.getElementById('recipe-form');
const recipeNameInput = document.getElementById('recipe-name');
const recipeDescriptionInput = document.getElementById('recipe-description');
const recipeInstructionsInput = document.getElementById('recipe-instructions');
const recipeIngredientsInput = document.getElementById('recipe-ingredients');
const closeRecipeModalBtn = document.getElementById('close-recipe-modal');
const cancelRecipeBtn = document.getElementById('cancel-recipe-btn');

const getSearchTerm = () => (searchInput ? searchInput.value.trim().toLowerCase() : '');

const getFilteredInventory = () => {
  const term = getSearchTerm();

  if (!term) {
    return inventoryData;
  }

  return inventoryData.filter((item) => (
    item.name.toLowerCase().includes(term) ||
    item.quantity.toLowerCase().includes(term) ||
    item.expiry.toLowerCase().includes(term)
  ));
};

const getFilteredRecipes = () => {
  const term = getSearchTerm();

  if (!term) {
    return recipeData;
  }

  return recipeData.filter((recipe) => (
    recipe.name.toLowerCase().includes(term) ||
    recipe.description.toLowerCase().includes(term) ||
    recipe.ingredients.some((ingredient) => ingredient.toLowerCase().includes(term))
  ));
};

const renderInventory = () => {
  const filteredInventory = getFilteredInventory();

  if (!filteredInventory.length) {
    inventoryList.innerHTML = '<article class="item-card"><div class="item-name">Nema rezultata</div><div class="item-meta">Pokušajte s drugim pojmom.</div></article>';
  } else {
    inventoryList.innerHTML = filteredInventory.map((item, index) => `
      <article class="item-card ${index % 2 === 0 ? 'primary' : 'alt'}">
        <div class="item-header">
          <div>
            <div class="item-name">${item.name}</div>
            <div class="item-meta">${item.quantity}</div>
          </div>
          <div class="item-actions">
            <span class="badge ${item.status}">${item.expiry.charAt(0).toUpperCase() + item.expiry.slice(1)}</span>
            <button type="button" class="mini-btn" data-item-action="add" data-item-id="${item.id}" style="width: 30px; height: 30px; min-width: 30px; padding: 0; border-radius: 9px; font-size: 1rem; line-height: 1; font-weight: 700;">+</button>
            <button type="button" class="mini-btn danger" data-item-action="remove" data-item-id="${item.id}" style="width: 30px; height: 30px; min-width: 30px; padding: 0; border-radius: 9px; font-size: 1rem; line-height: 1; font-weight: 700;">✕</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  inventoryCount.textContent = String(filteredInventory.length);
  expiringCount.textContent = filteredInventory.filter((item) => item.status !== 'good').length;
};

const renderRecipes = () => {
  const filteredRecipes = getFilteredRecipes();

  if (!filteredRecipes.length) {
    recipesList.innerHTML = '<article class="recipe-card"><div class="recipe-name">Nema recepta</div><div class="recipe-meta">Nema rezultata za ovu pretragu.</div></article>';
  } else {
    recipesList.innerHTML = filteredRecipes.map((recipe) => {
      const { summary, instructions } = splitRecipeDescription(recipe.description || '');
      const shortText = summary && summary !== 'Opis recepta' ? summary : 'Opis recepta';
      const detailText = instructions ? `<div class="recipe-description">${instructions.replace(/\n/g, '<br>')}</div>` : '';

      return `
        <article class="recipe-card">
          <div class="recipe-top">
            <div class="recipe-name">${recipe.name}</div>
            <span class="badge ${recipe.ready ? 'good' : 'warning'}">${recipe.ready ? 'Spremno' : 'Nedostaje'}</span>
          </div>
          <div class="recipe-meta">${shortText}</div>
          ${detailText}
          <div class="ingredients-list">
            ${recipe.ingredients.map((ingredient) => `<span class="chip">${ingredient}</span>`).join('')}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
            <button type="button" class="mini-btn recipe-use-btn" style="width: max-content; min-width: 128px; max-width: 100%; white-space: nowrap; justify-self: start; height: 34px; padding: 0 14px; border-radius: 10px; font-size: 0.9rem; font-weight: 700;" data-use-recipe-id="${recipe.id}">Koristi recept</button>
            <button type="button" class="mini-btn recipe-share-btn" data-share-recipe-id="${recipe.id}">Dijeli</button>
          </div>
        </article>
      `;
    }).join('');
  }

  readyCount.textContent = filteredRecipes.filter((recipe) => recipe.ready).length;
};

const renderShopping = () => {
  if (!shoppingList) {
    return;
  }

  const checkedCount = shoppingData.filter((item) => item.checked).length;
  if (moveCheckedBtn) {
    moveCheckedBtn.classList.toggle('hidden', checkedCount === 0);
    moveCheckedBtn.textContent = `✓ Kupljeno (${checkedCount}) → prebaci u inventar`;
  }

  if (!shoppingData.length) {
    shoppingList.innerHTML = '<article class="item-card shopping-item"><div class="item-name">Popis je prazan.</div><div class="item-meta">Dodajte prvu stavku.</div></article>';
    return;
  }

  shoppingList.innerHTML = shoppingData.map((item) => `
    <article class="item-card shopping-item ${item.checked ? 'primary' : 'alt'}">
      <label class="shopping-check" for="shopping-check-${item.id}">
        <input id="shopping-check-${item.id}" type="checkbox" data-shopping-check="${item.id}" ${item.checked ? 'checked' : ''} />
        <div>
          <div class="item-name" style="text-decoration:${item.checked ? 'line-through' : 'none'}; color:${item.checked ? 'var(--muted)' : '#1f2f43'};">${item.name}</div>
          <div class="item-meta">${Number(item.quantity || 0)} ${item.unit || 'kom'}</div>
        </div>
      </label>

      <div class="item-actions">
        <span class="badge ${item.checked ? 'good' : 'warning'}">${item.checked ? 'Kupljeno' : 'Lista'}</span>
        <button type="button" class="mini-btn danger" data-shopping-action="delete" data-shopping-id="${item.id}" aria-label="Ukloni ${item.name}">✕</button>
      </div>
    </article>
  `).join('');
};


const renderMatches = () => {
  matchesList.innerHTML = '';
};

const pendingInventoryMutations = new Map();

const applyOptimisticInventoryMutation = (mutateFn, requestFn) => {
  const previousInventory = JSON.parse(JSON.stringify(inventoryData));

  mutateFn();
  renderInventory();
  renderMatches();

  return requestFn().catch((error) => {
    inventoryData = previousInventory;
    renderInventory();
    renderMatches();
    throw error;
  });
};

const scheduleInventoryPersist = (itemId, requestFn) => {
  if (pendingInventoryMutations.has(itemId)) {
    clearTimeout(pendingInventoryMutations.get(itemId));
  }

  const timeoutId = setTimeout(async () => {
    pendingInventoryMutations.delete(itemId);

    try {
      await requestFn();
    } catch (error) {
      console.warn('Inventory sync failed:', error.message || error);
      await loadUserData();
    }
  }, 500);

  pendingInventoryMutations.set(itemId, timeoutId);
};

const syncAiButtons = () => {
  const saveButton = document.getElementById('ai-save-btn');
  const regenerateButton = document.getElementById('ai-regenerate-btn');

  document.querySelectorAll('.ai-mode-btn').forEach((button) => {
    const isActive = button.dataset.aiMode === aiMode;
    button.classList.toggle('active', isActive);
    button.disabled = aiLoading;
  });

  if (regenerateButton) {
    regenerateButton.disabled = aiLoading;
  }

  if (saveButton) {
    const canSave = Boolean(aiSuggestion && !aiSuggestion.insufficient && !aiLoading);
    saveButton.hidden = !canSave;
    saveButton.disabled = aiSaving || aiSaved;
    saveButton.textContent = aiSaved ? '✓ Spremljeno u moje recepte' : aiSaving ? 'Spremam...' : '💾 Spremi u moje recepte';
  }
};

const renderAiSuggestion = (suggestion = aiSuggestion) => {
  const output = document.getElementById('ai-suggestion-output');
  const saveButton = document.getElementById('ai-save-btn');

  if (!output) {
    return;
  }

  aiSuggestion = suggestion || null;

  if (aiLoading) {
    output.innerHTML = '<span class="ai-block ai-muted">Generiram preporuku...</span>';
    if (saveButton) {
      saveButton.hidden = true;
    }
    syncAiButtons();
    return;
  }

  if (!aiSuggestion) {
    output.innerHTML = '<span class="ai-block ai-muted">Odaberi stil ili pritisni Regeneriraj za prijedlog recepta po namirnicama koje trenutno imaš.</span>';
    if (saveButton) {
      saveButton.hidden = true;
    }
    syncAiButtons();
    return;
  }

  if (aiSuggestion.insufficient) {
    output.innerHTML = `
      <span class="ai-block ai-title">⚠️ Premalo sastojaka</span>
      <span class="ai-block">${aiSuggestion.message || aiSuggestion.reason || aiSuggestion.description || 'Dodajte još namirnica u inventar ili ih stavite na popis za kupnju.'}</span>
      <span class="ai-block ai-muted">Dodajte još namirnica u inventar ili ih stavite na popis za kupnju.</span>
    `;
    if (saveButton) {
      saveButton.hidden = true;
    }
    syncAiButtons();
    return;
  }

  const shortDescription = (aiSuggestion.description || 'Predloženo na temelju inventara.').trim();
  const compactDescription = shortDescription.length > 120 ? `${shortDescription.slice(0, 117).trim()}...` : shortDescription;
  const ingredients = (aiSuggestion.ingredients || []).slice(0, 4);
  const ingredientSummary = ingredients.length
    ? ingredients.map((ingredient) => `${ingredient.name || 'Sastojak'}`).join(' • ')
    : 'Nema detalja';
  const kcalMarkup = aiSuggestion.totalKcal
    ? `<span class="ai-block"><strong>• Ukupno ${aiSuggestion.totalKcal} kcal</strong>${aiSuggestion.servings && aiSuggestion.servings > 1 ? ` • ${aiSuggestion.kcalPerServing ?? 0} kcal po porciji (${aiSuggestion.servings} porcije)` : ''}</span>`
    : '';
  const fullInstructions = aiSuggestion.instructions ? String(aiSuggestion.instructions).replace(/\s+/g, ' ').trim() : '';
  const expandedMarkup = aiExpanded && fullInstructions
    ? `<span class="ai-block"><strong>Upute:</strong> ${fullInstructions}</span>`
    : '';

  output.innerHTML = `
    <span class="ai-title">${aiSuggestion.title || 'Predloženi recept'}</span>
    <span class="ai-block">${compactDescription}</span>
    ${kcalMarkup}
    ${expandedMarkup}
  `;

  if (saveButton) {
    saveButton.hidden = false;
  }
  syncAiButtons();
};

const requestAiSuggestion = async (mode = aiMode, regenerate = false) => {
  aiMode = mode;
  aiSaved = false;
  aiSuggestion = null;
  aiLoading = true;

  const output = document.getElementById('ai-suggestion-output');
  const saveButton = document.getElementById('ai-save-btn');

  if (output) {
    output.innerHTML = '<span class="ai-block ai-muted">Generiram preporuku...</span>';
  }

  if (saveButton) {
    saveButton.hidden = true;
    saveButton.disabled = true;
  }

  syncAiButtons();

  let timeoutId = null;

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(`${API_BASE}/api/recipes/ai-suggest`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        mode,
        avoidTitle: regenerate && aiSuggestion && !aiSuggestion.insufficient ? aiSuggestion.title : undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      clearAuthSession();
      window.location.replace('auth-view.html');
      throw new Error(data.message || 'Sesija je istekla. Prijavite se ponovno.');
    }

    if (!response.ok) {
      throw new Error(data.message || 'Do?lo je do pogre?ke. Poku?ajte ponovno.');
    }

    aiSuggestion = data.suggestion || null;
    aiLoading = false;
    renderAiSuggestion(aiSuggestion);
  } catch (error) {
    console.warn('AI suggestion unavailable:', error.message);
    aiSuggestion = {
      title: 'Fallback recept',
      description: 'AI model trenutno nije dostupan, ali imamo lokalni prijedlog.',
      ingredients: inventoryData.slice(0, 3).map((item) => ({
        name: item.name,
        quantity: 1,
        unit: item.unit || 'kom',
      })),
      instructions: 'Pokušajte napraviti jednostavno jelo od dostupnih namirnica.',
      confidence: 50,
      reason: 'Korišten je lokalni fallback zbog nedostupnog AI servisa.'
    };
    aiLoading = false;
    renderAiSuggestion(aiSuggestion);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    aiLoading = false;
    syncAiButtons();
  }
};

const generateAiRecipe = (mode = aiMode, regenerate = false) => requestAiSuggestion(mode, regenerate);

const saveAiRecipe = async () => {
  if (!aiSuggestion || aiSaving || aiSaved) {
    return;
  }

  aiSaving = true;
  syncAiButtons();

  try {
    const payload = {
      name: aiSuggestion.title || 'Predlo?eni recept',
      description: aiSuggestion.description || 'Opis recepta',
      ingredients: (aiSuggestion.ingredients || []).map((ingredient) => ({
        name: String(ingredient.name || '').trim(),
        quantity: Number(ingredient.quantity ?? 1),
        unit: String(ingredient.unit || 'kom').trim() || 'kom',
      })).filter((ingredient) => ingredient.name && Number.isFinite(ingredient.quantity)),
    };

    if (!payload.ingredients.length) {
      throw new Error('AI prijedlog nema nijedan sastojak za spremanje.');
    }

    const response = await fetch(`${API_BASE}/api/recipes`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      clearAuthSession();
      window.location.replace('auth-view.html');
      throw new Error(data.message || 'Sesija je istekla. Prijavite se ponovno.');
    }

    if (!response.ok) {
      throw new Error(data.message || 'Nije uspjelo spremiti AI recept.');
    }

    aiSaved = true;
    aiSuggestion = null;
    aiExpanded = false;
    renderAiSuggestion();
    await loadUserData();
  } catch (error) {
    console.warn('Failed to save AI recipe:', error.message);
    alert(error.message || 'Nije uspjelo spremiti AI recept.');
  } finally {
    aiSaving = false;
    syncAiButtons();
  }
};

shoppingForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = shoppingNameInput?.value.trim();
  const quantity = Number(shoppingQuantityInput?.value || 1);
  const unit = shoppingUnitSelect?.value || 'kom';

  if (!name || !unit) {
    alert('Naziv i jedinica su obavezni.');
    return;
  }

  try {
    const response = await fetchJson(`${API_BASE}/api/shopping`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` },
      body: JSON.stringify({ name, quantity, unit })
    });

    if (response?.item) {
      shoppingData = [...shoppingData, {
        id: response.item.id,
        name: response.item.name,
        quantity: Number(response.item.quantity ?? quantity),
        unit: response.item.unit || unit,
        checked: Boolean(response.item.checked),
      }];
      shoppingForm.reset();
      if (shoppingQuantityInput) {
        shoppingQuantityInput.value = '1';
      }
      renderShopping();
    }
  } catch (error) {
    alert(error.message || 'Nije uspjelo dodati stavku na popis za kupnju.');
  }
});

const syncShoppingUnitButtons = () => {
  const selectedUnit = shoppingUnitSelect?.value || 'kom';
  document.querySelectorAll('.unit-pill').forEach((button) => {
    button.classList.toggle('active', button.dataset.unit === selectedUnit);
  });
};

document.querySelectorAll('.unit-pill').forEach((button) => {
  button.addEventListener('click', () => {
    if (!shoppingUnitSelect) {
      return;
    }
    shoppingUnitSelect.value = button.dataset.unit || 'kom';
    syncShoppingUnitButtons();
  });
});

syncShoppingUnitButtons();

shoppingList?.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-shopping-check]');
  if (!checkbox) {
    return;
  }

  const itemId = checkbox.dataset.shoppingCheck;
  const item = shoppingData.find((entry) => String(entry.id) === String(itemId));
  if (!item) {
    return;
  }

  try {
    const response = await fetchJson(`${API_BASE}/api/shopping/${itemId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` },
      body: JSON.stringify({ checked: checkbox.checked })
    });

    shoppingData = shoppingData.map((entry) => String(entry.id) === String(itemId)
      ? { ...entry, checked: Boolean(response?.item?.checked ?? checkbox.checked) }
      : entry);
    renderShopping();
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    console.warn('Shopping update failed:', error.message || error);
  }
});

shoppingList?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-shopping-action]');
  if (!button) {
    return;
  }

  const itemId = button.dataset.shoppingId;
  const action = button.dataset.shoppingAction;

  if (action !== 'delete') {
    return;
  }

  try {
    await fetchJson(`${API_BASE}/api/shopping/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
    });
    shoppingData = shoppingData.filter((item) => String(item.id) !== String(itemId));
    renderShopping();
  } catch (error) {
    console.warn('Shopping delete failed:', error.message || error);
  }
});

moveCheckedBtn?.addEventListener('click', async () => {
  const checkedItems = shoppingData.filter((item) => item.checked);

  if (!checkedItems.length) {
    alert('Nema ozna?enih stavki za premje?tanje u inventar.');
    return;
  }

  try {
    await fetchJson(`${API_BASE}/api/shopping/move-checked`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
    });
    await loadUserData();
  } catch (error) {
    alert(error.message || 'Nije uspjelo premjestiti kupljene stavke.');
  }
});


const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const navItems = document.querySelectorAll('.nav-item');

const setActiveView = (viewName) => {
  const normalizedView = viewName === 'home' ? 'inventory' : viewName;

  tabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === normalizedView);
  });

  panels.forEach((panel) => {
    const active = panel.id === `${normalizedView}-panel` || (normalizedView === 'inventory' && panel.id === 'inventory-panel');
    panel.classList.toggle('active', active);
  });

  navItems.forEach((button) => {
    const active = button.dataset.view === normalizedView || (normalizedView === 'inventory' && button.dataset.view === 'inventory');
    button.classList.toggle('active', active);
  });
};

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    setActiveView(view);
  });
}

for (const navItem of navItems) {
  navItem.addEventListener('click', () => {
    const view = navItem.dataset.view;
    if (view === 'home') {
      setActiveView('inventory');
      return;
    }

    setActiveView(view);
  });
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    renderInventory();
    renderRecipes();
    renderMatches();
    renderShopping();
  });
}

const openInventoryModal = () => {
  if (!inventoryModal) {
    return;
  }

  const settings = readSettings();
  if (inventoryUnitSelect) {
    inventoryUnitSelect.value = settings.defaultUnit || 'kom';
  }

  inventoryModal.classList.remove('hidden');
  inventoryModal.setAttribute('aria-hidden', 'false');
  inventoryNameInput?.focus();
};

const closeInventoryModal = () => {
  if (!inventoryModal) {
    return;
  }

  inventoryModal.classList.add('hidden');
  inventoryModal.setAttribute('aria-hidden', 'true');
  inventoryForm?.reset();
  if (inventoryQuantityInput) {
    inventoryQuantityInput.value = '1';
  }
};

const applySettingsToUI = () => {
  const settings = readSettings();

  if (defaultUnitInput) {
    defaultUnitInput.value = settings.defaultUnit || 'kom';
  }

  if (reminderToggle) {
    reminderToggle.checked = settings.remindersEnabled !== false;
  }

  if (lowStockToggle) {
    lowStockToggle.checked = settings.lowStockAlert !== false;
  }

  if (themeSelect) {
    themeSelect.value = settings.theme || 'light';
    document.body.classList.toggle('dark-theme', settings.theme === 'dark');
  }

  if (inventoryUnitSelect) {
    inventoryUnitSelect.value = settings.defaultUnit || inventoryUnitSelect.value || 'kom';
  }
};

const openSettingsModal = () => {
  if (!settingsModal) {
    return;
  }

  applySettingsToUI();
  settingsModal.classList.remove('hidden');
  settingsModal.setAttribute('aria-hidden', 'false');
};

const closeSettingsModal = () => {
  if (!settingsModal) {
    return;
  }

  settingsModal.classList.add('hidden');
  settingsModal.setAttribute('aria-hidden', 'true');
};

document.getElementById('add-item-btn').addEventListener('click', openInventoryModal);
closeInventoryModalBtn?.addEventListener('click', closeInventoryModal);
cancelInventoryBtn?.addEventListener('click', closeInventoryModal);
settingsBtn?.addEventListener('click', openSettingsModal);
document.getElementById('close-settings-modal')?.addEventListener('click', closeSettingsModal);
document.getElementById('cancel-settings-btn')?.addEventListener('click', closeSettingsModal);
refreshMatchesBtn?.addEventListener('click', () => {
  renderMatches();
  if (searchInput) {
    searchInput.focus();
  }
});

document.querySelectorAll('.ai-mode-btn').forEach((button) => {
  button.addEventListener('click', () => {
    if (aiLoading) {
      return;
    }

    aiMode = button.dataset.aiMode || 'healthy';
    generateAiRecipe(aiMode);
  });
});

document.getElementById('ai-regenerate-btn')?.addEventListener('click', () => {
  generateAiRecipe(aiMode, true);
});

document.getElementById('ai-save-btn')?.addEventListener('click', saveAiRecipe);

document.getElementById('ai-suggestion-output')?.addEventListener('click', (event) => {
  if (!event.target || !event.target.closest('#ai-suggestion-output')) {
    return;
  }

  if (!aiSuggestion || aiLoading) {
    return;
  }

  aiExpanded = !aiExpanded;
  renderAiSuggestion(aiSuggestion);
});

syncAiButtons();
renderAiSuggestion();

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  if (installAppBtn) {
    installAppBtn.classList.remove('hidden');
  }
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      alert('Instalacija nije dostupna u ovom pregledniku. Otvorite aplikaciju preko localhost:8080 i ponovno pokušajte.');
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installAppBtn.classList.add('hidden');
  });
}

inventoryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = inventoryNameInput.value.trim();
  const quantity = Number(inventoryQuantityInput.value || 0);
  const unit = (inventoryUnitSelect && inventoryUnitSelect.value) || readSettings().defaultUnit || 'kom';
  const expiryValue = inventoryExpiryInput.value;
  const expiryDate = expiryValue
    ? new Date(`${expiryValue}T12:00:00`).toISOString()
    : new Date(Date.now() + 3 * 86400000).toISOString();

  if (!name || quantity <= 0) {
    alert('Unesite naziv i količinu namirnice.');
    return;
  }

  const optimisticItem = {
    id: `local-${Date.now()}`,
    name,
    quantityValue: quantity,
    quantity: `${quantity} ${unit}`,
    unit,
    expiry: 'ističe za 3 dana',
    status: 'good',
    expiryDate,
  };

  inventoryData = [optimisticItem, ...inventoryData];
  renderInventory();
  renderMatches();
  closeInventoryModal();

  try {
    await fetchJson(`${API_BASE}/api/inventory`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, quantity, unit, expiryDate })
    });

    await loadUserData();
  } catch (error) {
    inventoryData = inventoryData.filter((item) => String(item.id) !== String(optimisticItem.id));
    renderInventory();
    renderMatches();
    console.warn('Inventory add failed:', error.message || error);
  }
});

inventoryList?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-item-action]');
  if (!button) {
    return;
  }

  const itemId = button.dataset.itemId;
  const action = button.dataset.itemAction;
  const item = inventoryData.find((entry) => String(entry.id) === String(itemId));

  if (!item) {
    return;
  }

  const previousInventory = JSON.parse(JSON.stringify(inventoryData));

  if (action === 'add') {
    inventoryData = inventoryData.map((entry) => {
      if (String(entry.id) !== String(itemId)) {
        return entry;
      }

      const nextQuantity = Number(entry.quantityValue || 0) + 1;
      return {
        ...entry,
        quantityValue: nextQuantity,
        quantity: `${nextQuantity} ${entry.unit || 'kom'}`,
      };
    });
    renderInventory();
    renderMatches();

    scheduleInventoryPersist(itemId, async () => {
      const currentItem = inventoryData.find((entry) => String(entry.id) === String(itemId));
      if (!currentItem) {
        return;
      }

      await fetchJson(`${API_BASE}/api/inventory/${itemId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` },
        body: JSON.stringify({ quantity: Number(currentItem.quantityValue || 0) })
      });
    });

    return;
  }

  if (action === 'remove') {
    const nextQuantity = Number(item.quantityValue || 0) - 1;

    if (nextQuantity > 0) {
      inventoryData = inventoryData.map((entry) => {
        if (String(entry.id) !== String(itemId)) {
          return entry;
        }

        return {
          ...entry,
          quantityValue: nextQuantity,
          quantity: `${nextQuantity} ${entry.unit || 'kom'}`,
        };
      });
      renderInventory();
      renderMatches();

      scheduleInventoryPersist(itemId, async () => {
        const currentItem = inventoryData.find((entry) => String(entry.id) === String(itemId));
        if (!currentItem) {
          return;
        }

        await fetchJson(`${API_BASE}/api/inventory/${itemId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` },
          body: JSON.stringify({ quantity: Number(currentItem.quantityValue || 0) })
        });
      });

      return;
    }

    inventoryData = inventoryData.filter((entry) => String(entry.id) !== String(itemId));
    renderInventory();
    renderMatches();

    scheduleInventoryPersist(itemId, async () => {
      await fetchJson(`${API_BASE}/api/inventory/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('shpajzaToken')}` }
      });
    });

    return;
  }

  try {
    await loadUserData();
  } catch (error) {
    inventoryData = previousInventory;
    renderInventory();
    renderMatches();
    console.warn('Inventory update failed:', error.message || error);
    await loadUserData();
  }
});

const openRecipeModal = () => {
  if (recipeModal) {
    recipeModal.classList.remove('hidden');
    recipeModal.setAttribute('aria-hidden', 'false');
    recipeNameInput?.focus();
  }
};

const closeRecipeModal = () => {
  if (recipeModal) {
    recipeModal.classList.add('hidden');
    recipeModal.setAttribute('aria-hidden', 'true');
    recipeForm?.reset();
  }
};

settingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nextSettings = {
    defaultUnit: defaultUnitInput.value,
    remindersEnabled: reminderToggle.checked,
    lowStockAlert: lowStockToggle.checked,
    theme: themeSelect.value
  };

  try {
    const response = await fetchJson(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(nextSettings)
    });

    saveSettings(response.settings || nextSettings);
    applySettingsToUI();
    closeSettingsModal();
    return;
  } catch (error) {
    console.warn('Settings save failed, using local fallback:', error.message);
  }

  saveSettings(nextSettings);
  applySettingsToUI();
  closeSettingsModal();
});

document.getElementById('add-recipe-btn').addEventListener('click', openRecipeModal);
closeRecipeModalBtn?.addEventListener('click', closeRecipeModal);
cancelRecipeBtn?.addEventListener('click', closeRecipeModal);

recipesList?.addEventListener('click', async (event) => {
  const shareButton = event.target.closest('[data-share-recipe-id]');
  if (shareButton) {
    const recipeId = shareButton.dataset.shareRecipeId;
    const recipe = recipeData.find((entry) => String(entry.id) === String(recipeId));

    if (!recipe) {
      return;
    }

    const shareText = buildRecipeShareText(recipe);

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Recept: ${recipe.name}`,
          text: shareText,
        });
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        alert('Recept je kopiran u međuspremnik.');
        return;
      }
    } catch (error) {
      console.warn('Share unavailable:', error.message);
    }

    alert(shareText);
    return;
  }

  const useButton = event.target.closest('[data-use-recipe-id]');
  if (!useButton) {
    return;
  }

  const recipeId = useButton.dataset.useRecipeId;

  const previousInventory = JSON.parse(JSON.stringify(inventoryData));
  const recipe = recipeData.find((entry) => String(entry.id) === String(recipeId));

  if (recipe && recipe.ingredients?.length) {
    inventoryData = inventoryData.map((item) => {
      const match = recipe.ingredients.find((ingredientText) => ingredientText.toLowerCase().startsWith(`${item.name.toLowerCase()} `));
      if (!match || !item.quantityValue) {
        return item;
      }

      const nextQuantity = Math.max(0, Number(item.quantityValue || 0) - 1);
      return {
        ...item,
        quantityValue: nextQuantity,
        quantity: nextQuantity > 0 ? `${nextQuantity} ${item.unit || 'kom'}` : `${nextQuantity} ${item.unit || 'kom'}`,
      };
    }).filter((item) => Number(item.quantityValue || 0) > 0);

    renderInventory();
    renderMatches();
  }

  try {
    await fetchJson(`${API_BASE}/api/recipes/${recipeId}/use`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    await loadUserData();
  } catch (error) {
    inventoryData = previousInventory;
    renderInventory();
    renderMatches();
    alert(error.message || 'Nije moguće iskoristiti recept.');
  }
});

recipeForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = recipeNameInput.value.trim();
  const summary = recipeDescriptionInput.value.trim();
  const instructions = recipeInstructionsInput.value.trim();
  const description = normalizeRecipeDescription(summary, instructions);
  const ingredients = (recipeIngredientsInput.value || '')
    .split(',')
    .map((ingredient) => ingredient.trim())
    .filter(Boolean);

  if (!name) {
    recipeNameInput.focus();
    return;
  }

  const payloadIngredients = ingredients.length
    ? ingredients.map((ingredient) => ({ name: ingredient, quantity: 1, unit: 'kom' }))
    : [{ name: 'Sastojak', quantity: 1, unit: 'kom' }];

  try {
    await fetchJson(`${API_BASE}/api/recipes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name,
        description,
        ingredients: payloadIngredients,
      })
    });

    await loadUserData();
    closeRecipeModal();
    return;
  } catch (error) {
    console.warn('Recipe save failed, using local fallback:', error.message);
  }

  recipeData.unshift({
    id: Date.now(),
    name,
    description,
    ready: ingredients.length > 0,
    ingredients: ingredients.length ? ingredients.map((ingredient) => `${ingredient} 1 kom`) : ['Sastojak 1 kom']
  });

  renderRecipes();
  renderMatches();
  closeRecipeModal();
});

applySettingsToUI();
loadUserData();
