import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ItemModal, RecipeModal, SettingsModal } from '../components/Modals';
import {
  AuthError,
  createInventoryItem,
  createRecipe,
  defaultSettings,
  deleteInventoryItem,
  fetchAiSuggestion,
  getUser,
  loadCachedSettings,
  loadInventory,
  loadMatches,
  loadRecipes,
  loadSettings,
  saveSettings,
  updateInventoryQuantity,
  useRecipe
} from '../services/api';
import { Colors, darkColors, lightColors } from '../theme';
import { AiSuggestion, AppSettings, InventoryItem, Recipe, RecipeMatch, User } from '../types';
import {
  buildRecipeShareText,
  formatIngredient,
  formatQuantity,
  getExpiryState,
  splitRecipeDescription
} from '../utils';

type View_ = 'inventory' | 'recipes' | 'matches' | 'profile';

const TABS: { key: Exclude<View_, 'profile'>; label: string }[] = [
  { key: 'inventory', label: 'Inventar' },
  { key: 'recipes', label: 'Recepti' },
  { key: 'matches', label: 'Usklađeno' }
];

const NAV: { key: View_; icon: string; label: string }[] = [
  { key: 'inventory', icon: '🏠', label: 'Početna' },
  { key: 'recipes', icon: '🍽️', label: 'Recepti' },
  { key: 'matches', icon: '✅', label: 'Usklađeno' },
  { key: 'profile', icon: '👤', label: 'Profil' }
];

type Props = { navigation: any; onLogout: () => void | Promise<void> };

export default function MainScreen({ navigation, onLogout }: Props) {
  const [view, setView] = useState<View_>('inventory');
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [matches, setMatches] = useState<RecipeMatch[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [recipeModal, setRecipeModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [ai, setAi] = useState<AiSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const colors: Colors = settings.theme === 'dark' ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleError = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof AuthError) {
        onLogout();
        return;
      }
      Alert.alert('Greška', error instanceof Error && error.message ? error.message : fallback);
    },
    [onLogout]
  );

  const refresh = useCallback(async () => {
    try {
      const [items, recipeList, matchList] = await Promise.all([loadInventory(), loadRecipes(), loadMatches()]);
      setInventory(items);
      setRecipes(recipeList);
      setMatches(matchList);
    } catch (error) {
      handleError(error, 'Nije moguće dohvatiti podatke. Provjerite je li backend pokrenut.');
    }
  }, [handleError]);

  useEffect(() => {
    (async () => {
      setUser(await getUser());
      setSettings(await loadCachedSettings());
      try {
        setSettings(await loadSettings());
      } catch (error) {
        handleError(error, '');
        return;
      }
      await refresh();
      setLoading(false);
    })();
  }, [refresh, handleError]);

  useEffect(() => navigation.addListener('focus', refresh), [navigation, refresh]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const term = search.trim().toLowerCase();

  const inventoryView = useMemo(
    () =>
      inventory
        .map((item) => ({ item, expiry: getExpiryState(item.expiryDate) }))
        .filter(
          ({ item, expiry }) =>
            !term ||
            item.name.toLowerCase().includes(term) ||
            formatQuantity(item).toLowerCase().includes(term) ||
            expiry.text.toLowerCase().includes(term)
        ),
    [inventory, term]
  );

  const matchById = useMemo(() => new Map(matches.map((match) => [match.recipeId, match])), [matches]);

  const recipesView = useMemo(
    () =>
      recipes.filter(
        (recipe) =>
          !term ||
          recipe.name.toLowerCase().includes(term) ||
          recipe.description.toLowerCase().includes(term) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(term))
      ),
    [recipes, term]
  );

  const expiringCount = inventoryView.filter(({ expiry }) => expiry.status !== 'good').length;
  const readyCount = recipesView.filter((recipe) => matchById.get(recipe.id)?.canMake).length;

  const addItem = async (item: { name: string; quantity: number; unit: string; expiryDate: string }) => {
    try {
      await createInventoryItem(item);
      setItemModal(false);
      await refresh();
    } catch (error) {
      handleError(error, 'Nije uspjelo spremiti sastojak.');
    }
  };

  const increment = async (item: InventoryItem) => {
    try {
      await updateInventoryQuantity(item.id, item.quantity + 1);
      await refresh();
    } catch (error) {
      handleError(error, 'Nije uspjelo ažurirati inventar.');
    }
  };

  const remove = async (item: InventoryItem) => {
    try {
      await deleteInventoryItem(item.id);
      await refresh();
    } catch (error) {
      handleError(error, 'Nije uspjelo ukloniti namirnicu.');
    }
  };

  const addRecipe = async (recipe: Parameters<typeof createRecipe>[0]) => {
    try {
      await createRecipe(recipe);
      setRecipeModal(false);
      await refresh();
    } catch (error) {
      handleError(error, 'Nije uspjelo spremiti recept.');
    }
  };

  const consumeRecipe = async (recipe: Recipe) => {
    try {
      await useRecipe(recipe.id);
      await refresh();
      Alert.alert('Gotovo', `Recept "${recipe.name}" je iskorišten, inventar je ažuriran.`);
    } catch (error) {
      handleError(error, 'Nije moguće iskoristiti recept.');
    }
  };

  const shareRecipe = async (recipe: Recipe) => {
    try {
      await Share.share({ title: `Recept: ${recipe.name}`, message: buildRecipeShareText(recipe) });
    } catch (error) {
      Alert.alert('Dijeljenje nije dostupno', buildRecipeShareText(recipe));
    }
  };

  const generateAi = async () => {
    setAiLoading(true);
    try {
      const list = inventory.map((item) => `${item.name} ${item.quantity} ${item.unit}`).join(', ') || 'nema namirnica';
      setAi(await fetchAiSuggestion(`Predloži jedan praktičan recept pomoću ovih namirnica: ${list}`));
    } catch (error) {
      if (error instanceof AuthError) {
        onLogout();
        return;
      }
      setAi({
        title: 'Fallback recept',
        description: 'AI model trenutno nije dostupan, ali imamo lokalni prijedlog.',
        ingredients: inventory.slice(0, 3).map((item) => ({ name: item.name, quantity: 1, unit: item.unit })),
        instructions: 'Pokušajte napraviti jednostavno jelo od dostupnih namirnica.',
        confidence: 50,
        reason: 'Korišten je lokalni fallback zbog nedostupnog AI servisa.'
      });
    } finally {
      setAiLoading(false);
    }
  };

  const persistSettings = async (next: AppSettings) => {
    try {
      setSettings(await saveSettings(next));
      setSettingsModal(false);
    } catch (error) {
      handleError(error, 'Nije uspjelo spremiti postavke.');
    }
  };

  const badgeColor = (status: 'good' | 'warning' | 'danger') => colors[status];

  const openRecipe = (recipe: Recipe) => navigation.navigate('RecipeDetail', { recipeId: recipe.id });

  const renderInventory = () => (
    <View>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Moje namirnice</Text>
        <Pressable style={styles.pill} onPress={() => setItemModal(true)}>
          <Text style={styles.pillText}>+ Dodaj</Text>
        </Pressable>
      </View>
      {inventoryView.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.itemName}>Nema rezultata</Text>
          <Text style={styles.meta}>{term ? 'Pokušajte s drugim pojmom.' : 'Dodajte prvu namirnicu.'}</Text>
        </View>
      ) : (
        inventoryView.map(({ item, expiry }) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.meta}>{formatQuantity(item)}</Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={[styles.badge, { color: badgeColor(expiry.status), borderColor: badgeColor(expiry.status) }]}>
                  {expiry.text}
                </Text>
                <Pressable style={styles.miniBtn} onPress={() => increment(item)}>
                  <Text style={styles.miniBtnText}>+</Text>
                </Pressable>
                <Pressable style={[styles.miniBtn, { borderColor: colors.danger }]} onPress={() => remove(item)}>
                  <Text style={[styles.miniBtnText, { color: colors.danger }]}>✕</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderRecipes = () => (
    <View>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Preporučeni recepti</Text>
        <Pressable style={styles.pill} onPress={() => setRecipeModal(true)}>
          <Text style={styles.pillText}>+ Recept</Text>
        </Pressable>
      </View>
      {recipesView.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.itemName}>Nema recepta</Text>
          <Text style={styles.meta}>Nema rezultata za ovu pretragu.</Text>
        </View>
      ) : (
        recipesView.map((recipe) => {
          const ready = Boolean(matchById.get(recipe.id)?.canMake);
          const { summary, instructions } = splitRecipeDescription(recipe.description);
          return (
            <Pressable key={recipe.id} style={styles.card} onPress={() => openRecipe(recipe)}>
              <View style={styles.rowBetween}>
                <Text style={[styles.itemName, { flex: 1 }]}>{recipe.name}</Text>
                <Text
                  style={[
                    styles.badge,
                    { color: ready ? colors.good : colors.warning, borderColor: ready ? colors.good : colors.warning }
                  ]}
                >
                  {ready ? 'Spremno' : 'Nedostaje'}
                </Text>
              </View>
              <Text style={styles.meta}>{summary}</Text>
              {instructions ? <Text style={styles.instructions}>{instructions}</Text> : null}
              <View style={styles.chips}>
                {recipe.ingredients.map((ingredient, index) => (
                  <Text key={`${ingredient.name}-${index}`} style={styles.chip}>
                    {formatIngredient(ingredient)}
                  </Text>
                ))}
              </View>
              <View style={styles.cardActions}>
                <Pressable style={styles.pill} onPress={() => consumeRecipe(recipe)}>
                  <Text style={styles.pillText}>Koristi recept</Text>
                </Pressable>
                <Pressable style={[styles.pill, styles.pillSecondary]} onPress={() => shareRecipe(recipe)}>
                  <Text style={[styles.pillText, { color: colors.text }]}>Dijeli</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );

  const renderMatches = () => (
    <View>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Što možete napraviti</Text>
        <Pressable style={[styles.pill, styles.pillSecondary]} onPress={onRefresh}>
          <Text style={[styles.pillText, { color: colors.text }]}>Osvježi</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.cardAlt }]}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiLabel}>AI RECEPT</Text>
            <Text style={styles.itemName}>Prijedlog na temelju inventara</Text>
          </View>
          <Pressable style={[styles.pill, aiLoading && { opacity: 0.6 }]} onPress={generateAi} disabled={aiLoading}>
            <Text style={styles.pillText}>{aiLoading ? '...' : 'Generiraj'}</Text>
          </Pressable>
        </View>
        {aiLoading ? (
          <Text style={styles.meta}>Generiram preporuku...</Text>
        ) : ai ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.itemName}>{ai.title || 'Predloženi recept'}</Text>
            <Text style={styles.meta}>{ai.description || 'Predloženo na temelju inventara.'}</Text>
            <Text style={styles.aiLine}>
              <Text style={styles.bold}>Sastojci: </Text>
              {(ai.ingredients || []).map(formatIngredient).join(', ') || 'Nema detalja o sastojcima.'}
            </Text>
            <Text style={styles.aiLine}>
              <Text style={styles.bold}>Razlog: </Text>
              {ai.reason || 'Najbolje odgovara vašem inventaru.'}
            </Text>
            <Text style={styles.aiLine}>
              <Text style={styles.bold}>Vjerojatnost: </Text>
              {ai.confidence ?? 85}%
            </Text>
            <Text style={styles.aiLine}>
              <Text style={styles.bold}>Upute: </Text>
              {ai.instructions || 'Prilagodite količine prema inventaru.'}
            </Text>
          </View>
        ) : (
          <Text style={styles.meta}>Generiraj prijedlog recepta po namirnicama koje trenutno imaš.</Text>
        )}
      </View>

      {recipesView.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.itemName}>Nema rezultata</Text>
          <Text style={styles.meta}>Nema prijedloga za ovu pretragu.</Text>
        </View>
      ) : (
        recipesView.map((recipe) => {
          const match = matchById.get(recipe.id);
          const ready = Boolean(match?.canMake);
          const missing = (match?.missingIngredients || [])
            .map((entry) => `${entry.name} ${entry.required}${entry.unit ? ` ${entry.unit}` : ''}`)
            .join(', ');
          return (
            <Pressable
              key={recipe.id}
              onPress={() => openRecipe(recipe)}
              style={[styles.card, { borderLeftWidth: 4, borderLeftColor: ready ? colors.good : colors.warning }]}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.itemName, { flex: 1 }]}>{recipe.name}</Text>
                <Text
                  style={[
                    styles.badge,
                    { color: ready ? colors.good : colors.warning, borderColor: ready ? colors.good : colors.warning }
                  ]}
                >
                  {ready ? 'Možete napraviti' : 'Fale sastojci'}
                </Text>
              </View>
              <Text style={styles.meta}>{ready ? 'Imate sve sastojke.' : `Nedostaje: ${missing || 'sastojci'}`}</Text>
            </Pressable>
          );
        })
      )}
    </View>
  );

  const renderProfile = () => (
    <View>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Profil</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.itemName}>{user?.name || 'Korisnik'}</Text>
        <Text style={styles.meta}>{user?.email || 'email@example.com'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.itemName}>Uloga</Text>
        <Text style={styles.meta}>Korisnik aplikacije</Text>
      </View>
      <Pressable style={[styles.pill, { alignSelf: 'flex-start' }]} onPress={() => onLogout()}>
        <Text style={styles.pillText}>Odjavi se</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.eyebrow}>Zdravo, {user?.name || 'korisniče'}</Text>
          <Text style={styles.title}>Shpajza</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.iconBtn} onPress={() => setSettingsModal(true)} accessibilityLabel="Postavke">
            <Text style={styles.iconText}>⚙️</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => onLogout()} accessibilityLabel="Odjavi se">
            <Text style={styles.iconText}>⎋</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
              <Text style={[styles.summaryLabel, { color: colors.onPrimary }]}>Namirnice</Text>
              <Text style={[styles.summaryValue, { color: colors.onPrimary }]}>{inventoryView.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Ističe</Text>
              <Text style={styles.summaryValue}>{expiringCount}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Gotovi recepti</Text>
              <Text style={styles.summaryValue}>{readyCount}</Text>
            </View>
          </View>

          {view !== 'profile' && (
            <>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Pretraži namirnice i recepte"
                placeholderTextColor={colors.muted}
                style={styles.search}
              />
              <View style={styles.tabs}>
                {TABS.map((tab) => (
                  <Pressable
                    key={tab.key}
                    onPress={() => setView(tab.key)}
                    style={[styles.tab, view === tab.key && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.tabText, view === tab.key && { color: colors.onPrimary }]}>{tab.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {view === 'inventory' && renderInventory()}
          {view === 'recipes' && renderRecipes()}
          {view === 'matches' && renderMatches()}
          {view === 'profile' && renderProfile()}
        </ScrollView>
      )}

      <View style={styles.bottomNav}>
        {NAV.map((entry) => {
          const active = entry.key === view;
          return (
            <Pressable key={entry.label} style={styles.navItem} onPress={() => setView(entry.key)}>
              <Text style={[styles.navIcon, !active && { opacity: 0.55 }]}>{entry.icon}</Text>
              <Text style={[styles.navLabel, active && { color: colors.primary, fontWeight: '800' }]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ItemModal
        visible={itemModal}
        colors={colors}
        defaultUnit={settings.defaultUnit}
        onClose={() => setItemModal(false)}
        onSave={addItem}
      />
      <RecipeModal visible={recipeModal} colors={colors} onClose={() => setRecipeModal(false)} onSave={addRecipe} />
      <SettingsModal
        visible={settingsModal}
        colors={colors}
        settings={settings}
        onClose={() => setSettingsModal(false)}
        onSave={persistSettings}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    eyebrow: { color: c.muted, fontSize: 13, fontWeight: '600' },
    title: { color: c.text, fontSize: 28, fontWeight: '800' },
    topActions: { flexDirection: 'row', gap: 8 },
    iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    iconText: { fontSize: 18, color: c.text },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingBottom: 32 },
    summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    summaryCard: { flex: 1, backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border },
    summaryLabel: { color: c.muted, fontSize: 12, fontWeight: '600' },
    summaryValue: { color: c.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
    search: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: c.text, marginBottom: 12 },
    tabs: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: c.border },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
    tabText: { color: c.muted, fontWeight: '700' },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    panelTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    pill: { backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    pillSecondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    pillText: { color: c.onPrimary, fontWeight: '700' },
    card: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    itemName: { color: c.text, fontSize: 16, fontWeight: '700' },
    meta: { color: c.muted, marginTop: 2 },
    instructions: { color: c.text, marginTop: 8, lineHeight: 20 },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badge: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
    miniBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    miniBtnText: { color: c.primary, fontWeight: '800', fontSize: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    chip: { backgroundColor: c.cardAlt, color: c.text, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', fontSize: 12 },
    cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    aiLabel: { color: c.primary, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
    aiLine: { color: c.text, marginTop: 6, lineHeight: 20 },
    bold: { fontWeight: '800' },
    bottomNav: { flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 8 },
    navItem: { flex: 1, alignItems: 'center' },
    navIcon: { fontSize: 20 },
    navLabel: { color: c.muted, fontSize: 11, marginTop: 2 }
  });
