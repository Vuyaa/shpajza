import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { UNITS } from '../services/api';
import { Colors } from '../theme';
import { AppSettings, RecipeIngredient } from '../types';
import { normalizeRecipeDescription } from '../utils';

type SheetProps = {
  visible: boolean;
  title: string;
  colors: Colors;
  onClose: () => void;
  children: React.ReactNode;
};

function Sheet({ visible, title, colors, onClose, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.close, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, colors, ...props }: React.ComponentProps<typeof TextInput> & { label: string; colors: Colors }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.input,
          { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          props.multiline && { minHeight: 80, textAlignVertical: 'top' }
        ]}
      />
    </View>
  );
}

function UnitPicker({ value, onChange, colors }: { value: string; onChange: (unit: string) => void; colors: Colors }) {
  return (
    <View style={styles.chipRow}>
      {UNITS.map((unit) => {
        const active = unit === value;
        return (
          <Pressable
            key={unit}
            onPress={() => onChange(unit)}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: active ? colors.primary : colors.inputBg }
            ]}
          >
            <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{unit}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Actions({ colors, onCancel, onSubmit, submitText, busy }: {
  colors: Colors;
  onCancel: () => void;
  onSubmit: () => void;
  submitText: string;
  busy?: boolean;
}) {
  return (
    <View style={styles.actions}>
      <Pressable style={[styles.btn, { borderColor: colors.border, borderWidth: 1 }]} onPress={onCancel}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Odustani</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
        onPress={onSubmit}
        disabled={busy}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{submitText}</Text>
      </Pressable>
    </View>
  );
}

export function ItemModal({ visible, colors, defaultUnit, onClose, onSave }: {
  visible: boolean;
  colors: Colors;
  defaultUnit: string;
  onClose: () => void;
  onSave: (item: { name: string; quantity: number; unit: string; expiryDate: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState(defaultUnit);
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setQuantity('1');
      setUnit(defaultUnit);
      setExpiry('');
    }
  }, [visible, defaultUnit]);

  const submit = async () => {
    const amount = Number(quantity.replace(',', '.'));
    if (!name.trim() || !(amount > 0)) {
      Alert.alert('Nedostaju podaci', 'Unesite naziv i količinu namirnice.');
      return;
    }

    let expiryDate = new Date(Date.now() + 3 * 86400000).toISOString();
    if (expiry.trim()) {
      const parsed = new Date(`${expiry.trim()}T12:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry.trim()) || Number.isNaN(parsed.getTime())) {
        Alert.alert('Neispravan datum', 'Rok trajanja unesite kao GGGG-MM-DD, npr. 2026-11-30.');
        return;
      }
      expiryDate = parsed.toISOString();
    }

    setBusy(true);
    try {
      await onSave({ name: name.trim(), quantity: amount, unit, expiryDate });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Novi sastojak" colors={colors} onClose={onClose}>
      <Field label="Naziv namirnice" colors={colors} value={name} onChangeText={setName} placeholder="npr. Jaja" />
      <Field
        label="Količina"
        colors={colors}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
      />
      <Text style={[styles.label, { color: colors.muted }]}>Jedinica</Text>
      <UnitPicker value={unit} onChange={setUnit} colors={colors} />
      <Field
        label="Rok trajanja (GGGG-MM-DD)"
        colors={colors}
        value={expiry}
        onChangeText={setExpiry}
        placeholder="npr. 2026-11-30"
        autoCapitalize="none"
      />
      <Actions colors={colors} onCancel={onClose} onSubmit={submit} submitText="Spremi sastojak" busy={busy} />
    </Sheet>
  );
}

export function RecipeModal({ visible, colors, onClose, onSave }: {
  visible: boolean;
  colors: Colors;
  onClose: () => void;
  onSave: (recipe: { name: string; description: string; ingredients: RecipeIngredient[] }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [instructions, setInstructions] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setSummary('');
      setInstructions('');
      setIngredients('');
    }
  }, [visible]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Nedostaje naziv', 'Unesite naziv recepta.');
      return;
    }

    const parsed = ingredients
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => ({ name: entry, quantity: 1, unit: 'kom' }));

    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        description: normalizeRecipeDescription(summary, instructions),
        ingredients: parsed.length ? parsed : [{ name: 'Sastojak', quantity: 1, unit: 'kom' }]
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Novi recept" colors={colors} onClose={onClose}>
      <Field label="Naziv recepta" colors={colors} value={name} onChangeText={setName} placeholder="npr. Pita od jabuka" />
      <Field
        label="Kratki opis"
        colors={colors}
        value={summary}
        onChangeText={setSummary}
        placeholder="Kratko opišite recept..."
        multiline
      />
      <Field
        label="Cijeli recept / upute"
        colors={colors}
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Napišite cijeli recept: što, kako i koliko..."
        multiline
      />
      <Field
        label="Sastojci (odvojeni zarezom)"
        colors={colors}
        value={ingredients}
        onChangeText={setIngredients}
        placeholder="Jaja, Sir, Sol"
      />
      <Actions colors={colors} onCancel={onClose} onSubmit={submit} submitText="Spremi recept" busy={busy} />
    </Sheet>
  );
}

export function SettingsModal({ visible, colors, settings, onClose, onSave }: {
  visible: boolean;
  colors: Colors;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(settings);
    }
  }, [visible, settings]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Postavke" colors={colors} onClose={onClose}>
      <Text style={[styles.label, { color: colors.muted }]}>Standardna jedinica</Text>
      <UnitPicker value={draft.defaultUnit} onChange={(defaultUnit) => setDraft({ ...draft, defaultUnit })} colors={colors} />

      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>Podsjetnici za isteknuće</Text>
        <Switch
          value={draft.remindersEnabled}
          onValueChange={(remindersEnabled) => setDraft({ ...draft, remindersEnabled })}
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>Upozorenje za niske zalihe</Text>
        <Switch value={draft.lowStockAlert} onValueChange={(lowStockAlert) => setDraft({ ...draft, lowStockAlert })} />
      </View>

      <Text style={[styles.label, { color: colors.muted }]}>Tema</Text>
      <View style={styles.chipRow}>
        {(['light', 'dark'] as const).map((theme) => {
          const active = draft.theme === theme;
          return (
            <Pressable
              key={theme}
              onPress={() => setDraft({ ...draft, theme })}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: active ? colors.primary : colors.inputBg }
              ]}
            >
              <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                {theme === 'light' ? 'Svijetla' : 'Tamna'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Actions colors={colors} onCancel={onClose} onSubmit={submit} submitText="Spremi postavke" busy={busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  close: { fontSize: 20 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  toggleLabel: { fontSize: 15, flex: 1, paddingRight: 12 }
});
