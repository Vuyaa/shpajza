import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AuthError,
  createRecipe,
  deleteRecipe,
  loadCachedSettings,
  loadInventory,
  loadRecipes,
  updateRecipe,
  useRecipe,
  UNITS,
  defaultSettings
} from '../services/api';
import { Colors, darkColors, lightColors } from '../theme';
import { AppSettings, InventoryItem, Recipe, RecipeIngredient } from '../types';
import { buildRecipeShareText, normalizeRecipeDescription, splitRecipeDescription } from '../utils';

type Props = {
  navigation: any;
  route: { params: { recipeId: string } };
  onLogout: () => void | Promise<void>;
};

type DraftIngredient = { name: string; quantity: string; unit: string };

const toDraft = (ingredient: RecipeIngredient): DraftIngredient => ({
  name: ingredient.name,
  quantity: String(ingredient.quantity),
  unit: ingredient.unit || 'kom'
});

export default function RecipeDetailScreen({ navigation, route, onLogout }: Props) {
  const { recipeId } = route.params;
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ingModal, setIngModal] = useState<{ index: number | null; name: string; quantity: string; unit: string } | null>(null);
  const [textModal, setTextModal] = useState(false);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [instructions, setInstructions] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([]);

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

  const load = useCallback(async () => {
    try {
      const [recipes, items] = await Promise.all([loadRecipes(), loadInventory()]);
      setRecipe(recipes.find((entry) => entry.id === recipeId) || null);
      setInventory(items);
    } catch (error) {
      handleError(error, 'Nije moguće dohvatiti recept.');
    } finally {
      setLoading(false);
    }
  }, [recipeId, handleError]);

  useEffect(() => {
    loadCachedSettings().then(setSettings);
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredients.map((ingredient) => {
      const key = ingredient.name.trim().toLowerCase();
      const available = inventory
        .filter((item) => item.name.trim().toLowerCase() === key)
        .reduce((sum, item) => sum + item.quantity, 0);
      return { ingredient, available, missing: Math.max(0, ingredient.quantity - available) };
    });
  }, [recipe, inventory]);

  const missingRows = rows.filter((row) => row.missing > 0);
  const canMake = rows.length > 0 && missingRows.length === 0;
  const round = (value: number) => String(Math.round(value * 100) / 100);

  const startEdit = () => {
    if (!recipe) return;
    const { summary: currentSummary, instructions: currentInstructions } = splitRecipeDescription(recipe.description);
    setName(recipe.name);
    setSummary(currentSummary === 'Opis recepta' ? '' : currentSummary);
    setInstructions(currentInstructions);
    setDraftIngredients(recipe.ingredients.map(toDraft));
    setEditing(true);
  };

  const updateDraft = (index: number, patch: Partial<DraftIngredient>) =>
    setDraftIngredients((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  const persist = async (payload: { name: string; description: string; ingredients: RecipeIngredient[] }) => {
    if (!recipe) return false;
    setBusy(true);
    try {
      if (recipe.editable) {
        await updateRecipe(recipe.id, payload);
        await load();
      } else {
        // Zadani recept se ne mijenja: sprema se kao vlastita kopija.
        const created = await createRecipe(payload);
        const newId = created?.recipe?.id ?? created?.id;
        if (newId) {
          navigation.replace('RecipeDetail', { recipeId: newId });
        } else {
          navigation.goBack();
        }
      }
      return true;
    } catch (error) {
      handleError(error, 'Nije uspjelo spremiti recept.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!recipe) return;

    if (!name.trim()) {
      Alert.alert('Nedostaje naziv', 'Unesite naziv recepta.');
      return;
    }

    const ingredients: RecipeIngredient[] = [];
    for (const entry of draftIngredients) {
      if (!entry.name.trim()) continue;
      const quantity = Number(entry.quantity.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity < 0) {
        Alert.alert('Neispravna količina', `Provjeri količinu za "${entry.name}".`);
        return;
      }
      ingredients.push({ name: entry.name.trim(), quantity, unit: entry.unit || 'kom' });
    }

    if (!ingredients.length) {
      Alert.alert('Nedostaju sastojci', 'Recept mora imati barem jedan sastojak.');
      return;
    }

    const ok = await persist({
      name: name.trim(),
      description: normalizeRecipeDescription(summary, instructions),
      ingredients
    });
    if (ok) setEditing(false);
  };

  const persistIngredients = (ingredients: RecipeIngredient[]) => {
    if (!recipe) return Promise.resolve(false);
    return persist({ name: recipe.name, description: recipe.description, ingredients });
  };

  const openIngredient = (index: number | null) => {
    if (!recipe) return;
    const current = index === null ? null : recipe.ingredients[index];
    setIngModal({
      index,
      name: current?.name ?? '',
      quantity: current ? round(current.quantity) : '1',
      unit: current?.unit || 'kom'
    });
  };

  const stepFor = (unit: string) => (unit === 'g' || unit === 'ml' ? 50 : unit === 'kg' || unit === 'l' ? 0.5 : 1);

  const stepQuantity = (direction: 1 | -1) =>
    setIngModal((current) => {
      if (!current) return current;
      const value = Number(current.quantity.replace(',', '.')) || 0;
      return { ...current, quantity: round(Math.max(0, value + direction * stepFor(current.unit))) };
    });

  const saveIngredient = async () => {
    if (!recipe || !ingModal) return;
    const ingName = ingModal.name.trim();
    const quantity = Number(ingModal.quantity.replace(',', '.'));
    if (!ingName) {
      Alert.alert('Nedostaje naziv', 'Unesite naziv sastojka.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      Alert.alert('Neispravna količina', 'Provjerite količinu.');
      return;
    }
    const entry: RecipeIngredient = { name: ingName, quantity, unit: ingModal.unit };
    const next =
      ingModal.index === null
        ? [...recipe.ingredients, entry]
        : recipe.ingredients.map((item, i) => (i === ingModal.index ? entry : item));
    setIngModal(null);
    await persistIngredients(next);
  };

  const removeIngredient = async () => {
    if (!recipe || !ingModal || ingModal.index === null) return;
    if (recipe.ingredients.length <= 1) {
      Alert.alert('Nije moguće', 'Recept mora imati barem jedan sastojak.');
      return;
    }
    const next = recipe.ingredients.filter((_, i) => i !== ingModal.index);
    setIngModal(null);
    await persistIngredients(next);
  };

  const openTextEditor = () => {
    if (!recipe) return;
    const { summary: s, instructions: i } = splitRecipeDescription(recipe.description);
    setName(recipe.name);
    setSummary(s === 'Opis recepta' ? '' : s);
    setInstructions(i);
    setTextModal(true);
  };

  const saveText = async () => {
    if (!recipe) return;
    if (!name.trim()) {
      Alert.alert('Nedostaje naziv', 'Unesite naziv recepta.');
      return;
    }
    setTextModal(false);
    await persist({
      name: name.trim(),
      description: normalizeRecipeDescription(summary, instructions),
      ingredients: recipe.ingredients
    });
  };

  const consume = async () => {
    if (!recipe) return;
    setBusy(true);
    try {
      await useRecipe(recipe.id);
      await load();
      Alert.alert('Gotovo', `Recept "${recipe.name}" je iskorišten, inventar je ažuriran.`);
    } catch (error) {
      handleError(error, 'Nije moguće iskoristiti recept.');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!recipe) return;
    try {
      await Share.share({ title: `Recept: ${recipe.name}`, message: buildRecipeShareText(recipe) });
    } catch {
      Alert.alert('Dijeljenje nije dostupno', buildRecipeShareText(recipe));
    }
  };

  const confirmDelete = () => {
    if (!recipe) return;
    Alert.alert('Obrisati recept?', `"${recipe.name}" će biti trajno obrisan.`, [
      { text: 'Odustani', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecipe(recipe.id);
            navigation.goBack();
          } catch (error) {
            handleError(error, 'Nije uspjelo obrisati recept.');
          }
        }
      }
    ]);
  };

  const header = (title: string) => (
    <View style={styles.topbar}>
      <Pressable onPress={() => (editing ? setEditing(false) : navigation.goBack())} hitSlop={10} style={styles.backBtn}>
        <Text style={styles.backText}>{editing ? '✕' : '←'}</Text>
      </Pressable>
      <Text style={styles.topTitle} numberOfLines={1}>
        {title}
      </Text>
      {recipe && !editing ? (
        <Pressable onPress={startEdit} style={styles.pill}>
          <Text style={styles.pillText}>Uredi</Text>
        </Pressable>
      ) : (
        <View style={{ width: 64 }} />
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header('Recept')}
        <View style={styles.center}>
          <Text style={styles.meta}>Recept nije pronađen.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (editing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
        {header('Uredi recept')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Naziv recepta</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} />

            <Text style={styles.label}>Kratki opis</Text>
            <TextInput
              value={summary}
              onChangeText={setSummary}
              style={[styles.input, styles.multiline]}
              multiline
              placeholder="Kratko opišite recept..."
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.label}>Cijeli recept / upute</Text>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              style={[styles.input, styles.multiline, { minHeight: 140 }]}
              multiline
              placeholder="Napišite cijeli recept: što, kako i koliko..."
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.label}>Sastojci</Text>
            {draftIngredients.map((entry, index) => (
              <View key={index} style={styles.card}>
                <View style={styles.editRow}>
                  <TextInput
                    value={entry.name}
                    onChangeText={(value) => updateDraft(index, { name: value })}
                    placeholder="Naziv"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, { flex: 1 }]}
                  />
                  <Pressable
                    onPress={() => setDraftIngredients((current) => current.filter((_, i) => i !== index))}
                    style={[styles.miniBtn, { borderColor: colors.danger }]}
                  >
                    <Text style={[styles.miniBtnText, { color: colors.danger }]}>✕</Text>
                  </Pressable>
                </View>
                <View style={[styles.editRow, { marginTop: 8 }]}>
                  <TextInput
                    value={entry.quantity}
                    onChangeText={(value) => updateDraft(index, { quantity: value })}
                    keyboardType="decimal-pad"
                    placeholder="Količina"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, { width: 90 }]}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {UNITS.map((unit) => {
                      const active = entry.unit === unit;
                      return (
                        <Pressable
                          key={unit}
                          onPress={() => updateDraft(index, { unit })}
                          style={[styles.unitChip, active && { backgroundColor: colors.primary }]}
                        >
                          <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{unit}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ))}

            <Pressable
              style={[styles.pill, styles.pillSecondary, { alignSelf: 'flex-start', marginBottom: 20 }]}
              onPress={() =>
                setDraftIngredients((current) => [...current, { name: '', quantity: '1', unit: 'kom' }])
              }
            >
              <Text style={[styles.pillText, { color: colors.text }]}>+ Sastojak</Text>
            </Pressable>

            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => setEditing(false)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Odustani</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={save} disabled={busy}>
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Spremi recept</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const { summary: shownSummary, instructions: shownInstructions } = splitRecipeDescription(recipe.description);
  const statusColor = canMake ? colors.good : colors.warning;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={settings.theme === 'dark' ? 'light-content' : 'dark-content'} />
      {header('Recept')}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.rowBetween}>
          <Text style={[styles.title, { flex: 1 }]}>{recipe.name}</Text>
          <Text style={[styles.badge, { color: statusColor, borderColor: statusColor }]}>
            {canMake ? 'Možete napraviti' : 'Fale sastojci'}
          </Text>
        </View>
        <Pressable onPress={openTextEditor} style={{ marginTop: 6 }}>
          <Text style={styles.meta}>{shownSummary && shownSummary !== 'Opis recepta' ? shownSummary : 'Dodaj opis...'}</Text>
          <Text style={{ color: colors.primary, fontWeight: '700', marginTop: 4 }}>✎ Uredi naslov, opis i upute</Text>
        </Pressable>
        {!recipe.editable && <Text style={[styles.meta, { marginTop: 4 }]}>Zadani recept — izmjene se spremaju kao tvoja kopija.</Text>}

        <Text style={styles.sectionTitle}>Sastojci</Text>
        {rows.map(({ ingredient, available, missing }, index) => {
          const ok = missing === 0;
          return (
            <Pressable
              key={`${ingredient.name}-${index}`}
              onPress={() => openIngredient(index)}
              style={[styles.card, { borderLeftWidth: 4, borderLeftColor: ok ? colors.good : colors.danger }]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.itemName}>{ingredient.name}</Text>
                <Text style={styles.itemName}>
                  {round(ingredient.quantity)} {ingredient.unit}
                </Text>
              </View>
              <Text style={styles.meta}>Imate: {round(available)} {ingredient.unit}</Text>
              <Text style={{ color: ok ? colors.good : colors.danger, fontWeight: '700', marginTop: 2 }}>
                {ok ? '✓ Imate dovoljno' : `Fali: ${round(missing)} ${ingredient.unit}`}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => openIngredient(null)}
          style={[styles.card, { alignItems: 'center', borderStyle: 'dashed', borderColor: colors.primary }]}
        >
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>+ Dodaj sastojak</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.cardAlt }]}>
          <Text style={styles.itemName}>{canMake ? 'Imate sve sastojke.' : 'Nedostaje ukupno'}</Text>
          {!canMake &&
            missingRows.map(({ ingredient, missing }, index) => (
              <Text key={`${ingredient.name}-${index}`} style={styles.meta}>
                • {ingredient.name}: {round(missing)} {ingredient.unit}
              </Text>
            ))}
        </View>

        <Text style={styles.sectionTitle}>Upute</Text>
        <Pressable style={styles.card} onPress={openTextEditor}>
          {shownInstructions ? (
            <Text style={styles.instructions}>{shownInstructions}</Text>
          ) : (
            <Text style={styles.meta}>Dodirni za dodavanje uputa za pripremu...</Text>
          )}
        </Pressable>

        <View style={styles.actions}>
          <Pressable style={[styles.btn, { backgroundColor: colors.primary, opacity: busy || !canMake ? 0.5 : 1 }]} onPress={consume} disabled={busy || !canMake}>
            <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Koristi recept</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnOutline]} onPress={share}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Dijeli</Text>
          </Pressable>
        </View>

        {recipe.editable && (
          <Pressable style={[styles.btn, { borderWidth: 1, borderColor: colors.danger, marginTop: 10 }]} onPress={confirmDelete}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Obriši recept</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={ingModal !== null} transparent animationType="slide" onRequestClose={() => setIngModal(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIngModal(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sectionTitle}>{ingModal?.index === null ? 'Novi sastojak' : 'Uredi sastojak'}</Text>
            <Text style={styles.label}>Naziv</Text>
            <TextInput
              value={ingModal?.name ?? ''}
              onChangeText={(value) => setIngModal((c) => (c ? { ...c, name: value } : c))}
              style={styles.input}
              placeholder="npr. Brašno"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>Količina</Text>
            <View style={[styles.editRow, { marginBottom: 8 }]}>
              <Pressable onPress={() => stepQuantity(-1)} style={styles.stepBtn}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <TextInput
                value={ingModal?.quantity ?? ''}
                onChangeText={(value) => setIngModal((c) => (c ? { ...c, quantity: value } : c))}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, textAlign: 'center', marginBottom: 0, fontSize: 18, fontWeight: '700' }]}
              />
              <Pressable onPress={() => stepQuantity(1)} style={styles.stepBtn}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {UNITS.map((unit) => {
                const active = ingModal?.unit === unit;
                return (
                  <Pressable
                    key={unit}
                    onPress={() => setIngModal((c) => (c ? { ...c, unit } : c))}
                    style={[styles.unitChip, active && { backgroundColor: colors.primary }]}
                  >
                    <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{unit}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => setIngModal(null)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Odustani</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={saveIngredient} disabled={busy}>
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Spremi</Text>
              </Pressable>
            </View>
            {ingModal?.index !== null && (
              <Pressable style={[styles.btn, { borderWidth: 1, borderColor: colors.danger, marginTop: 10, flex: 0 }]} onPress={removeIngredient}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Ukloni sastojak</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={textModal} transparent animationType="slide" onRequestClose={() => setTextModal(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTextModal(false)} />
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>Naslov, opis i upute</Text>
              <Text style={styles.label}>Naziv recepta</Text>
              <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} />
              <Text style={styles.label}>Opis</Text>
              <TextInput
                value={summary}
                onChangeText={setSummary}
                style={[styles.input, styles.multiline]}
                multiline
                placeholder="Kratko opišite jelo..."
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.label}>Upute za pripremu</Text>
              <TextInput
                value={instructions}
                onChangeText={setInstructions}
                style={[styles.input, styles.multiline, { minHeight: 180 }]}
                multiline
                placeholder="Korak po korak kako napraviti jelo..."
                placeholderTextColor={colors.muted}
              />
              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => setTextModal(false)}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Odustani</Text>
                </Pressable>
                <Pressable style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={saveText} disabled={busy}>
                  <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Spremi</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    backText: { color: c.text, fontSize: 20 },
    topTitle: { flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' },
    content: { padding: 20, paddingBottom: 40 },
    title: { color: c.text, fontSize: 26, fontWeight: '800' },
    sectionTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 20, marginBottom: 10 },
    meta: { color: c.muted, marginTop: 2 },
    instructions: { color: c.text, lineHeight: 22 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    badge: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
    card: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
    itemName: { color: c.text, fontSize: 16, fontWeight: '700' },
    pill: { backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    pillSecondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    pillText: { color: c.onPrimary, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
    btnOutline: { borderWidth: 1, borderColor: c.border },
    label: { color: c.muted, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
    input: { backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.text, marginBottom: 8 },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    unitChip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, backgroundColor: c.inputBg },
    miniBtn: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: c.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    miniBtnText: { fontWeight: '800', fontSize: 16 },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
    stepBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    stepText: { color: c.onPrimary, fontSize: 26, fontWeight: '800' }
  });
