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

const API_BASE = 'http://localhost:4000';
const token = localStorage.getItem('shpajzaToken');
const savedUser = JSON.parse(localStorage.getItem('shpajzaUser') || '{}');

if (!token) {
  window.location.replace('auth-view.html');
}

const logoutBtn = document.getElementById('logout-btn');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileLogoutBtn = document.getElementById('profile-logout-btn');

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

const doLogout = () => {
  localStorage.removeItem('shpajzaToken');
  localStorage.removeItem('shpajzaUser');
  window.location.replace('auth-view.html');
};

if (logoutBtn) {
  logoutBtn.addEventListener('click', doLogout);
}

if (profileLogoutBtn) {
  profileLogoutBtn.addEventListener('click', doLogout);
}

let inventoryData = [
  { id: 1, name: 'Jaja', quantity: '6 kom', expiry: 'ističe za 2 dana', status: 'good' },
  { id: 2, name: 'Mlječni sir', quantity: '200 g', expiry: 'ističe za 1 dan', status: 'warning' },
  { id: 3, name: 'Rajčica', quantity: '4 kom', expiry: 'ističe danas', status: 'danger' },
  { id: 4, name: 'Kruh', quantity: '1 kom', expiry: 'ističe za 5 dana', status: 'good' },
  { id: 5, name: 'Lubenica', quantity: '2 kom', expiry: 'ističe za 4 dana', status: 'good' }
];

let recipeData = [
  {
    id: 1,
    name: 'Omlet',
    description: 'Brzi doručak s jajima i sirom.',
    ready: true,
    ingredients: ['Jaja 2 kom', 'Sir 50 g', 'Sol']
  },
  {
    id: 2,
    name: 'Salata od rajčice',
    description: 'Svježa i jednostavna salata.',
    ready: true,
    ingredients: ['Rajčica 2 kom', 'Lubenica 1 kom', 'Sol']
  },
  {
    id: 3,
    name: 'Sendvič',
    description: 'Klasičan sendvič s kruhom i sirom.',
    ready: false,
    ingredients: ['Kruh 2 kom', 'Sir 80 g', 'Rajčica 1 kom']
  }
];

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
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
    const [inventoryResponse, recipesResponse, settingsResponse] = await Promise.all([
      fetchJson(`${API_BASE}/api/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetchJson(`${API_BASE}/api/recipes`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetchJson(`${API_BASE}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` }
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

    inventoryData = nextInventory.length ? nextInventory : inventoryData;
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

    if (settingsResponse && settingsResponse.settings) {
      saveSettings(settingsResponse.settings);
      applySettingsToUI();
    }
  } catch (error) {
    console.warn('Using demo data because backend is unavailable:', error.message);
  }

  renderInventory();
  renderRecipes();
  renderMatches();
};

const inventoryList = document.getElementById('inventory-list');
const recipesList = document.getElementById('recipes-list');
const matchesList = document.getElementById('matches-list');
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

const renderMatches = () => {
  const filteredRecipes = getFilteredRecipes();

  if (!filteredRecipes.length) {
    matchesList.innerHTML = '<article class="match-card partial"><div class="match-top"><div class="match-name">Nema rezultata</div></div><div class="match-meta">Nema predloga za ovu pretragu.</div></article>';
    return;
  }

  matchesList.innerHTML = filteredRecipes.map((recipe) => {
    const stateClass = recipe.ready ? 'ready' : 'partial';
    const badgeText = recipe.ready ? 'Možete napraviti' : 'Fale nam sastojci';
    const badgeClass = recipe.ready ? 'good' : 'warning';

    return `
      <article class="match-card ${stateClass}">
        <div class="match-top">
          <div class="match-name">${recipe.name}</div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="match-meta">${recipe.ready ? 'Imate sve sastojke.' : 'Nedostaje: Kruh 1 kom'}</div>
      </article>
    `;
  }).join('');
};

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const navItems = document.querySelectorAll('.nav-item');

const setActiveView = (viewName) => {
  const normalizedView = viewName === 'home' ? 'inventory' : viewName;

  tabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === normalizedView);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${normalizedView}-panel` || (normalizedView === 'inventory' && panel.id === 'inventory-panel'));
  });

  navItems.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName || (normalizedView === 'inventory' && button.dataset.view === 'home'));
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

  const newItem = {
    name,
    quantity,
    unit,
    expiryDate
  };

  try {
    await fetchJson(`${API_BASE}/api/inventory`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(newItem)
    });

    await loadUserData();
    closeInventoryModal();
    return;
  } catch (error) {
    inventoryData.unshift({
      id: Date.now(),
      name,
      quantity: `${quantity} ${unit}`,
      expiry: 'ističe za 3 dana',
      status: 'good'
    });

    renderInventory();
    closeInventoryModal();
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

  try {
    if (action === 'add') {
      await fetchJson(`${API_BASE}/api/inventory/${itemId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantity: Number(item.quantityValue || 0) + 1 })
      });
    }

    if (action === 'remove') {
      await fetchJson(`${API_BASE}/api/inventory/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    }

    await loadUserData();
  } catch (error) {
    alert(error.message || 'Nije uspjelo ažurirati inventar.');
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

  try {
    await fetchJson(`${API_BASE}/api/recipes/${recipeId}/use`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    await loadUserData();
  } catch (error) {
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
