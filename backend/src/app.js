const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { prisma } = require('./db');
const { findMatchingRecipes } = require('./services/recipeMatcher');
const { generateRecipeSuggestion } = require('./services/aiRecipeService');
const { convertQuantity } = require('./services/units');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'Shpajza-dev-secret';
const JWT_SECRET_CANDIDATES = Array.from(new Set([
  process.env.JWT_SECRET,
  'Shpajza-dev-secret',
  'shpajza-local-dev-secret',
  'change-me-later',
].filter(Boolean)));

const DEFAULT_SETTINGS = {
  defaultUnit: 'kom',
  remindersEnabled: true,
  lowStockAlert: true,
  theme: 'light',
};

let inventory = [];
let recipeStore = [];
let users = [];

const isDbReady = () => Boolean(app.locals.dbReady);

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const verifyPassword = (password, salt, expectedHash) => {
  const { hash } = hashPassword(password, salt);
  return hash === expectedHash;
};

const createToken = (user) => jwt.sign(
  {
    sub: user.id,
    email: user.email,
    name: user.name,
  },
  JWT_SECRET,
  { expiresIn: '7d' }
);

const verifyToken = (token) => {
  let lastError = null;

  for (const secret of JWT_SECRET_CANDIDATES) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Invalid token.');
};

const getRequestUser = (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return null;
  }

  try {
    const payload = verifyToken(token);
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch (error) {
    return null;
  }
};

const requireAuth = (req, res, next) => {
  const user = getRequestUser(req);

  if (!user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  req.user = user;
  return next();
};

const normalizeInventoryItem = (item) => ({
  id: item.id,
  userId: item.userId || null,
  name: item.name,
  quantity: Number(item.quantity),
  unit: item.unit,
  expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString() : null,
  createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
});

const normalizeRecipeIngredient = (ingredient = {}) => ({
  id: ingredient.id || crypto.randomUUID(),
  name: ingredient.name,
  quantity: Number(ingredient.quantity ?? 0),
  unit: ingredient.unit || '',
});

const normalizeRecipe = (recipe = {}) => ({
  id: recipe.id,
  userId: recipe.userId || null,
  name: recipe.name,
  description: recipe.description || '',
  ingredients: Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((ingredient) => normalizeRecipeIngredient(ingredient))
    : [],
  createdAt: recipe.createdAt ? new Date(recipe.createdAt).toISOString() : null,
});

const normalizeSettings = (settings = {}) => ({
  ...DEFAULT_SETTINGS,
  ...(settings && typeof settings === 'object' ? settings : {}),
});

const resolveUserSettings = (userRecord = null) => {
  if (!userRecord) {
    return { ...DEFAULT_SETTINGS };
  }

  return normalizeSettings(userRecord.settings || {});
};

// Novi korisnici kreću s praznim inventarom (nema početnih namirnica).
const seedDefaultInventoryForUser = async () => [];

const listInventoryForUser = async (userId) => {
  if (isDbReady()) {
    const rows = await prisma.inventoryItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (rows.length === 0) {
      return seedDefaultInventoryForUser(userId);
    }

    return rows.map(normalizeInventoryItem);
  }

  const userItems = inventory.filter((item) => item.userId === userId);
  if (userItems.length === 0) {
    return seedDefaultInventoryForUser(userId);
  }

  return userItems.map(normalizeInventoryItem);
};

const listRecipesForUser = async (userId) => {
  if (isDbReady()) {
    const rows = await prisma.recipe.findMany({
      where: { userId },
      include: { ingredients: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((recipe) => normalizeRecipe({
      ...recipe,
      ingredients: recipe.ingredients,
    }));
  }

  return recipeStore
    .filter((recipe) => !recipe.userId || recipe.userId === userId)
    .map(normalizeRecipe);
};

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Shpajza-backend',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Email format is invalid.' });
  }

  if (isDbReady()) {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists.' });
    }

    const { salt, hash } = hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash: hash,
        salt,
        settings: DEFAULT_SETTINGS,
      },
    });

    const token = createToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
    });

    await seedDefaultInventoryForUser(newUser.id);

    return res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  }

  if (users.some((user) => user.email === normalizedEmail)) {
    return res.status(409).json({ message: 'User with this email already exists.' });
  }

  const { salt, hash } = hashPassword(password);
  const newUser = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: hash,
    salt,
    settings: { ...DEFAULT_SETTINGS },
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  const token = createToken({
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
  });

  await seedDefaultInventoryForUser(newUser.id);

  return res.status(201).json({
    message: 'User registered successfully.',
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (isDbReady()) {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isValid = verifyPassword(password, user.salt, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  }

  const user = users.find((candidate) => candidate.email === normalizedEmail);

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const validPassword = verifyPassword(password, user.salt, user.passwordHash);

  if (!validPassword) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = createToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return res.json({
    message: 'Login successful.',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  if (isDbReady()) {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json({ user });
  }

  const user = users.find((candidate) => candidate.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

app.get('/api/inventory', async (req, res) => {
  const requestUser = getRequestUser(req);

  if (requestUser) {
    return res.json({ items: await listInventoryForUser(requestUser.id) });
  }

  return res.json({ items: inventory });
});

app.post('/api/inventory', async (req, res) => {
  const { name, quantity, unit, expiryDate } = req.body || {};
  const requestUser = getRequestUser(req);

  if (!name || quantity === undefined || !unit) {
    return res.status(400).json({
      message: 'Name, quantity and unit are required.',
    });
  }

  if (requestUser) {
    if (isDbReady()) {
      const item = await prisma.inventoryItem.create({
        data: {
          userId: requestUser.id,
          name,
          quantity: Number(quantity),
          unit,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        },
      });

      return res.status(201).json({ item: normalizeInventoryItem(item) });
    }

    const newItem = {
      id: crypto.randomUUID(),
      userId: requestUser.id,
      name,
      quantity: Number(quantity),
      unit,
      expiryDate: expiryDate || null,
    };

    inventory.push(newItem);

    return res.status(201).json({ item: normalizeInventoryItem(newItem) });
  }

  const newItem = {
    id: crypto.randomUUID(),
    name,
    quantity: Number(quantity),
    unit,
    expiryDate: expiryDate || null,
  };

  inventory.push(newItem);

  return res.status(201).json({ item: normalizeInventoryItem(newItem) });
});

app.patch('/api/inventory/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, quantity, unit, expiryDate } = req.body || {};

  if (isDbReady()) {
    const item = await prisma.inventoryItem.findUnique({ where: { id } });

    if (!item || item.userId !== req.user.id) {
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    const updatedItem = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(quantity !== undefined ? { quantity: Number(quantity) } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
      },
    });

    return res.json({ item: normalizeInventoryItem(updatedItem) });
  }

  const itemIndex = inventory.findIndex((entry) => entry.id === id && entry.userId === req.user.id);

  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Inventory item not found.' });
  }

  const item = inventory[itemIndex];
  inventory[itemIndex] = {
    ...item,
    ...(name !== undefined ? { name } : {}),
    ...(quantity !== undefined ? { quantity: Number(quantity) } : {}),
    ...(unit !== undefined ? { unit } : {}),
    ...(expiryDate !== undefined ? { expiryDate: expiryDate || null } : {}),
  };

  return res.json({ item: normalizeInventoryItem(inventory[itemIndex]) });
});

app.delete('/api/inventory/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (isDbReady()) {
    const item = await prisma.inventoryItem.findUnique({ where: { id } });

    if (!item || item.userId !== req.user.id) {
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    await prisma.inventoryItem.delete({ where: { id } });
    return res.json({ deleted: true, id });
  }

  const itemIndex = inventory.findIndex((entry) => entry.id === id && entry.userId === req.user.id);

  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Inventory item not found.' });
  }

  inventory.splice(itemIndex, 1);
  return res.json({ deleted: true, id });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  const userRecord = isDbReady()
    ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { settings: true } })
    : users.find((user) => user.id === req.user.id);

  return res.json({ settings: resolveUserSettings(userRecord) });
});

app.put('/api/settings', requireAuth, async (req, res) => {
  const nextSettings = normalizeSettings(req.body || {});

  if (isDbReady()) {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { settings: nextSettings },
      select: { settings: true },
    });

    return res.json({ settings: normalizeSettings(updatedUser.settings) });
  }

  const existingUser = users.find((user) => user.id === req.user.id);

  if (!existingUser) {
    return res.status(404).json({ message: 'User not found.' });
  }

  existingUser.settings = nextSettings;
  return res.json({ settings: normalizeSettings(existingUser.settings) });
});

app.get('/api/recipes', async (req, res) => {
  const requestUser = getRequestUser(req);

  if (requestUser) {
    const userRecipes = await listRecipesForUser(requestUser.id);
    const defaultRecipes = recipeStore
      .filter((recipe) => !recipe.userId)
      .map(normalizeRecipe);

    return res.json({
      recipes: [...defaultRecipes, ...userRecipes.filter((recipe) => !defaultRecipes.some((defaultRecipe) => defaultRecipe.id === recipe.id))],
    });
  }

  return res.json({
    recipes: recipeStore.filter((recipe) => !recipe.userId).map(normalizeRecipe),
  });
});

app.post('/api/recipes/ai-suggest', requireAuth, async (req, res) => {
  const { prompt = '', mode = '', avoidTitle = '' } = req.body || {};

  const userInventory = await listInventoryForUser(req.user.id);
  const userRecipes = await listRecipesForUser(req.user.id);
  const allRecipes = [
    ...recipeStore.filter((recipe) => !recipe.userId).map(normalizeRecipe),
    ...userRecipes,
  ];

  const suggestion = await generateRecipeSuggestion({
    inventoryItems: userInventory,
    recipes: allRecipes,
    userPrompt: prompt,
    mode,
    avoidTitle,
  });

  return res.json({ suggestion });
});

app.post('/api/recipes', requireAuth, async (req, res) => {
  const { name, description, ingredients } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Recipe name is required.' });
  }

  const parsedIngredients = Array.isArray(ingredients)
    ? ingredients.map((ingredient) => ({
        name: String(ingredient?.name || '').trim(),
        quantity: Number(ingredient?.quantity ?? 0),
        unit: String(ingredient?.unit || '').trim(),
      })).filter((ingredient) => ingredient.name && Number.isFinite(ingredient.quantity))
    : [];

  if (!parsedIngredients.length) {
    return res.status(400).json({ message: 'At least one ingredient is required.' });
  }

  const recipePayload = {
    name: String(name).trim(),
    description: String(description || '').trim() || 'Opis recepta',
    userId: req.user.id,
    ingredients: parsedIngredients,
  };

  if (isDbReady()) {
    const recipe = await prisma.recipe.create({
      data: {
        userId: req.user.id,
        name: recipePayload.name,
        description: recipePayload.description,
        ingredients: {
          create: recipePayload.ingredients.map((ingredient) => ({
            name: ingredient.name,
            quantity: Number(ingredient.quantity),
            unit: ingredient.unit || 'kom',
          })),
        },
      },
      include: { ingredients: true },
    });

    return res.status(201).json({
      recipe: normalizeRecipe({
        ...recipe,
        ingredients: recipe.ingredients,
      }),
    });
  }

  const newRecipe = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    name: recipePayload.name,
    description: recipePayload.description,
    ingredients: recipePayload.ingredients.map((ingredient, index) => ({
      id: `${req.user.id}-recipe-${Date.now()}-${index}`,
      ...ingredient,
    })),
    createdAt: new Date().toISOString(),
  };

  recipeStore.push(newRecipe);

  return res.status(201).json({ recipe: normalizeRecipe(newRecipe) });
});

const parseRecipeIngredients = (ingredients) => (Array.isArray(ingredients)
  ? ingredients.map((ingredient) => ({
      name: String(ingredient?.name || '').trim(),
      quantity: Number(ingredient?.quantity ?? 0),
      unit: String(ingredient?.unit || '').trim() || 'kom',
    })).filter((ingredient) => ingredient.name && Number.isFinite(ingredient.quantity))
  : []);

app.put('/api/recipes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, ingredients } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Recipe name is required.' });
  }

  const parsedIngredients = parseRecipeIngredients(ingredients);

  if (!parsedIngredients.length) {
    return res.status(400).json({ message: 'At least one ingredient is required.' });
  }

  const nextName = String(name).trim();
  const nextDescription = String(description || '').trim() || 'Opis recepta';

  if (isDbReady()) {
    const existing = await prisma.recipe.findUnique({ where: { id } });

    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ message: 'Recipe not found or not editable.' });
    }

    const [, recipe] = await prisma.$transaction([
      prisma.recipeIngredient.deleteMany({ where: { recipeId: id } }),
      prisma.recipe.update({
        where: { id },
        data: {
          name: nextName,
          description: nextDescription,
          ingredients: { create: parsedIngredients },
        },
        include: { ingredients: true },
      }),
    ]);

    return res.json({ recipe: normalizeRecipe(recipe) });
  }

  const index = recipeStore.findIndex((recipe) => recipe.id === id && recipe.userId === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Recipe not found or not editable.' });
  }

  recipeStore[index] = {
    ...recipeStore[index],
    name: nextName,
    description: nextDescription,
    ingredients: parsedIngredients.map((ingredient, ingredientIndex) => ({
      id: `${id}-ingredient-${Date.now()}-${ingredientIndex}`,
      ...ingredient,
    })),
  };

  return res.json({ recipe: normalizeRecipe(recipeStore[index]) });
});

app.delete('/api/recipes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (isDbReady()) {
    const existing = await prisma.recipe.findUnique({ where: { id } });

    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ message: 'Recipe not found or not editable.' });
    }

    await prisma.$transaction([
      prisma.recipeIngredient.deleteMany({ where: { recipeId: id } }),
      prisma.recipe.delete({ where: { id } }),
    ]);

    return res.json({ deleted: true, id });
  }

  const index = recipeStore.findIndex((recipe) => recipe.id === id && recipe.userId === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Recipe not found or not editable.' });
  }

  recipeStore.splice(index, 1);
  return res.json({ deleted: true, id });
});

app.post('/api/recipes/:id/use', requireAuth, async (req, res) => {
  const recipeId = req.params.id;
  const allRecipes = [
    ...recipeStore.filter((recipe) => !recipe.userId),
    ...(await listRecipesForUser(req.user.id)),
  ];
  const recipe = allRecipes.find((candidate) => candidate.id === recipeId);

  if (!recipe) {
    return res.status(404).json({ message: 'Recipe not found.' });
  }

  const items = await listInventoryForUser(req.user.id);
  const updates = [];

  for (const ingredient of recipe.ingredients) {
    const key = String(ingredient.name || '').trim().toLowerCase();
    const matching = items.filter((candidate) => String(candidate.name || '').trim().toLowerCase() === key);

    if (!matching.length) {
      return res.status(400).json({
        message: `You do not have enough ingredients to use this recipe. Missing: ${ingredient.name}.`,
      });
    }

    let remaining = Number(ingredient.quantity ?? 0);
    const total = matching.reduce(
      (sum, candidate) => sum + convertQuantity(candidate.quantity, candidate.unit, ingredient.unit),
      0
    );

    if (total < remaining) {
      return res.status(400).json({
        message: `You do not have enough ${ingredient.name}.`,
      });
    }

    for (const item of matching) {
      if (remaining <= 0) break;
      const current = Number(item.quantity ?? 0);
      const currentInRecipeUnit = convertQuantity(current, item.unit, ingredient.unit);
      const takenInRecipeUnit = Math.min(currentInRecipeUnit, remaining);
      remaining -= takenInRecipeUnit;
      const takenInItemUnit = convertQuantity(takenInRecipeUnit, ingredient.unit, item.unit);
      updates.push({ id: item.id, quantity: Math.max(0, Math.round((current - takenInItemUnit) * 1000) / 1000) });
    }
  }

  for (const update of updates) {
    if (isDbReady()) {
      await prisma.inventoryItem.update({
        where: { id: update.id },
        data: { quantity: Number(update.quantity) },
      });
    } else {
      const itemIndex = inventory.findIndex((entry) => entry.id === update.id && entry.userId === req.user.id);
      if (itemIndex !== -1) {
        inventory[itemIndex].quantity = Number(update.quantity);
      }
    }
  }

  return res.json({
    message: `Recipe "${recipe.name}" used successfully.`,
    recipeId: recipe.id,
    updatedItems: updates,
  });
});

app.get('/api/recipes/match', async (req, res) => {
  const requestUser = getRequestUser(req);
  const items = requestUser ? await listInventoryForUser(requestUser.id) : inventory;
  const userRecipes = requestUser
    ? await listRecipesForUser(requestUser.id)
    : recipeStore.filter((recipe) => !recipe.userId).map(normalizeRecipe);
  const matches = findMatchingRecipes(items, userRecipes);

  res.json({
    items,
    matches,
    canMakeCount: matches.filter((recipe) => recipe.canMake).length,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error.' });
});

module.exports = app;

