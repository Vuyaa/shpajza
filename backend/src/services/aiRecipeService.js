const DEFAULT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const normalizeIngredientName = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ');

const normalizeIngredientValues = (ingredient = {}) => {
  if (typeof ingredient === 'string') {
    return {
      name: ingredient,
      quantity: 1,
      unit: 'kom',
    };
  }

  return {
    name: ingredient?.name || '',
    quantity: Number(ingredient?.quantity ?? 1),
    unit: ingredient?.unit || 'kom',
  };
};

const buildFallbackSuggestion = ({ inventoryItems = [], recipes = [] } = {}) => {
  if (!recipes.length) {
    return {
      title: 'Dodajte barem jedan recept',
      description: 'Nema dostupnih recepata za analizu.',
      ingredients: [],
      instructions: 'Dodajte recept ili inventar kako bismo mogli predložiti jelo.',
      confidence: 0,
      source: 'local',
      reason: 'Nema dovoljno podataka za preporuku.',
    };
  }

  const inventoryMap = new Map(
    inventoryItems.map((item) => [normalizeIngredientName(item.name), item])
  );

  const scoredRecipes = recipes
    .map((recipe) => {
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      let total = 0;
      let matched = 0;
      let ready = 0;

      for (const ingredient of ingredients) {
        const normalizedIngredient = normalizeIngredientValues(ingredient);
        const key = normalizeIngredientName(normalizedIngredient.name);
        total += 1;

        if (!key) {
          continue;
        }

        const inventoryItem = inventoryMap.get(key);
        if (!inventoryItem) {
          continue;
        }

        matched += 1;

        const requiredQuantity = Number(normalizedIngredient.quantity || 1);
        const availableQuantity = Number(inventoryItem.quantity ?? 0);

        if (availableQuantity >= requiredQuantity) {
          ready += 1;
        }
      }

      const score = (matched * 3) + (ready * 2) - (total - matched) * 2;

      return {
        recipe,
        score,
        matched,
        ready,
        total,
      };
    })
    .sort((left, right) => right.score - left.score);

  const bestMatch = scoredRecipes[0];

  if (!bestMatch) {
    return {
      title: 'Nema preporuke',
      description: 'Pokušajte dodati više namirnica u inventar.',
      ingredients: [],
      instructions: 'Nema dovoljno dostupnih podataka za predloženi recept.',
      confidence: 0,
      source: 'local',
      reason: 'Nema odgovarajućih sastojaka u inventaru.',
    };
  }

  const { recipe, matched, ready, total } = bestMatch;
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((ingredient) => normalizeIngredientValues(ingredient))
    : [];

  const confidence = Math.min(96, Math.max(40, 45 + (ready * 18) + (matched * 8)));

  return {
    title: recipe.name || 'Predloženi recept',
    description: recipe.description || 'Predloženo na temelju vašeg inventara.',
    ingredients: ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: Number(ingredient.quantity || 1),
      unit: ingredient.unit || 'kom',
    })),
    instructions: 'Koristite namirnice koje imate, a preostale količine prilagodite prema inventaru.',
    confidence: Math.round(confidence),
    source: 'local',
    reason: `Najveće podudaranje s inventarom: ${matched} od ${total} sastojaka dostupno.`,
  };
};

const parseJsonFromText = (text = '') => {
  if (!text) {
    return null;
  }

  const cleaned = String(text).replace(/```json|```/gi, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
};

const MODE_HINTS = {
  healthy: 'Predloži ZDRAVIJE, lagano i hranjivo jelo (više povrća/proteina, manje masnoće i šećera).',
  quick: 'Predloži jelo koje je GOTOVO BRZO (najviše 15-20 minuta pripreme, malo koraka).',
  full: 'Predloži PUNI SLIJED JELA (predjelo, glavno jelo i desert). U instructions jasno odvoji svaki slijed (Predjelo / Glavno jelo / Desert) s koracima, a ingredients neka sadrži sastojke svih slijedova.',
};

const roundKcal = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

const normalizeAiSuggestion = (payload = {}) => {
  const title = payload.title || payload.name || 'Predloženi recept';
  const description = payload.description || 'Predloženo uz pomoć AI modela.';
  const ingredients = Array.isArray(payload.ingredients)
    ? payload.ingredients.map((ingredient) => {
        const item = typeof ingredient === 'string' ? { name: ingredient, quantity: 1, unit: 'kom' } : ingredient;
        return {
          name: item.name || 'Sastojak',
          quantity: Number(item.quantity ?? 1),
          unit: item.unit || 'kom',
          kcal: roundKcal(item.kcal),
        };
      })
    : [];

  const totalKcal = ingredients.reduce((sum, item) => sum + item.kcal, 0);
  const servings = Math.max(1, Math.round(Number(payload.servings) || 1));

  return {
    title: String(title).trim() || 'Predloženi recept',
    description: String(description).trim() || 'Predloženo uz pomoć AI modela.',
    ingredients,
    instructions: Array.isArray(payload.instructions)
      ? payload.instructions.join('\n')
      : payload.instructions || 'Koristite namirnice koje imate i prilagodite količine po potrebi.',
    confidence: Number(payload.confidence ?? 85),
    source: 'ai',
    reason: payload.reason || 'Prijedlog je generiran od strane AI modela.',
    servings,
    totalKcal,
    kcalPerServing: Math.round(totalKcal / servings),
  };
};

const generateRecipeSuggestion = async ({ inventoryItems = [], recipes = [], userPrompt = '', mode = '', avoidTitle = '' } = {}) => {
  const fallback = buildFallbackSuggestion({ inventoryItems, recipes });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      reason: fallback.reason || 'Groq API key not configured. Returning local suggestion.',
    };
  }

  try {
    const inventorySummary = inventoryItems.length
      ? inventoryItems.map((item) => `${item.name} ${item.quantity ?? 1} ${item.unit || 'kom'}`).join(', ')
      : 'Nema nijedne namirnice.';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Ti si kuharski asistent. Odgovaraj ISKLJUČIVO na hrvatskom jeziku i vrati samo valjan JSON s ključevima: title (naziv jela), description (kratak opis, 1-2 rečenice),             ingredients (niz objekata s name, quantity (broj), unit (jedna od: kom, g, kg, l, ml, pak, kutija, karton), kcal (UKUPNE kalorije te količine sastojka, cijeli broj, procijenjene prema uobičajenim nutritivnim vrijednostima)), servings (broj porcija), instructions (detaljne upute za pripremu, korak po korak, svaki korak u novom retku označen brojem), confidence (broj 0-100), reason (zašto je ovaj recept dobar izbor). Prvenstveno koristi namirnice koje korisnik ima; količine neka budu realne.'
          },
          {
            role: 'user',
                        content: `Imam ove namirnice: ${inventorySummary}. Zahtjev: ${[MODE_HINTS[mode], userPrompt].filter(Boolean).join(' ') || 'Predloži jedan praktičan recept od onoga što imam.'}${avoidTitle ? ` Predloži DRUGAČIJE jelo od "${avoidTitle}".` : ''}`
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq error: ${response.status}`);
    }

    const payload = await response.json();
    const rawContent = payload?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonFromText(rawContent);

    if (!parsed || !parsed.title) {
      return { ...fallback, source: 'local', reason: 'AI response was not valid JSON; using local fallback.' };
    }

    return normalizeAiSuggestion(parsed);
  } catch (error) {
    return {
      ...fallback,
      source: 'local',
      reason: `AI unavailable; used local recommendation instead. ${error.message || ''}`,
    };
  }
};

module.exports = {
  DEFAULT_MODEL,
  normalizeIngredientName,
  buildFallbackSuggestion,
  generateRecipeSuggestion,
};
