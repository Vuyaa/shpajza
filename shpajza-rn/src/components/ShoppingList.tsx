import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import {
  AuthError,
  UNITS,
  addShoppingItem,
  deleteShoppingItem,
  loadShopping,
  moveCheckedToInventory,
  setShoppingChecked
} from '../services/api';
import { Colors } from '../theme';
import { ShoppingItem } from '../types';

type Props = {
  colors: Colors;
  defaultUnit: string;
  onAuthError: () => void;
  onInventoryChanged: () => Promise<void> | void;
};

const round = (value: number) => String(Math.round(value * 100) / 100);

export default function ShoppingList({ colors, defaultUnit, onAuthError, onInventoryChanged }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState(defaultUnit);

  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof AuthError) {
        onAuthError();
        return;
      }
      Alert.alert('Greška', error instanceof Error && error.message ? error.message : 'Radnja nije uspjela.');
    },
    [onAuthError]
  );

  const load = useCallback(async () => {
    try {
      setItems(await loadShopping());
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const amount = Number(quantity.replace(',', '.'));
    if (!name.trim()) {
      Alert.alert('Nedostaje naziv', 'Unesite što trebate kupiti.');
      return;
    }
    try {
      await addShoppingItem({ name: name.trim(), quantity: amount > 0 ? amount : 1, unit });
      setName('');
      setQuantity('1');
      await load();
    } catch (error) {
      fail(error);
    }
  };

  const toggle = async (item: ShoppingItem) => {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, checked: !entry.checked } : entry)));
    try {
      await setShoppingChecked(item.id, !item.checked);
    } catch (error) {
      fail(error);
      await load();
    }
  };

  const remove = async (item: ShoppingItem) => {
    try {
      await deleteShoppingItem(item.id);
      await load();
    } catch (error) {
      fail(error);
    }
  };

  const moveChecked = async () => {
    try {
      await moveCheckedToInventory();
      await load();
      await onInventoryChanged();
    } catch (error) {
      fail(error);
    }
  };

  const checkedCount = items.filter((item) => item.checked).length;
  const card = { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 };
  const input = {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text
  };

  return (
    <View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 12 }}>Popis za kupnju</Text>

      <View style={card}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Što treba kupiti?"
            placeholderTextColor={colors.muted}
            style={[input, { flex: 1 }]}
            onSubmitEditing={add}
          />
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            style={[input, { width: 64, textAlign: 'center' }]}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {UNITS.map((entry) => {
            const active = entry === unit;
            return (
              <Pressable
                key={entry}
                onPress={() => setUnit(entry)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: active ? colors.primary : colors.inputBg
                }}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{entry}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={add}
          style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>+ Dodaj na popis</Text>
        </Pressable>
      </View>

      {loading ? null : items.length === 0 ? (
        <View style={card}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Popis je prazan.</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>
            Dodajte stavke ručno ili iz recepta (gumb "Dodaj nedostajuće na popis").
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
            <Pressable onPress={() => toggle(item)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, marginRight: 10, color: item.checked ? colors.good : colors.muted }}>
                {item.checked ? '☑' : '☐'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: item.checked ? colors.muted : colors.text,
                    fontSize: 16,
                    fontWeight: '700',
                    textDecorationLine: item.checked ? 'line-through' : 'none'
                  }}
                >
                  {item.name}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {round(item.quantity)} {item.unit}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => remove(item)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: colors.danger,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text style={{ color: colors.danger, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))
      )}

      {checkedCount > 0 ? (
        <Pressable
          onPress={moveChecked}
          style={{ backgroundColor: colors.good, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>
            ✓ Kupljeno ({checkedCount}) → prebaci u inventar
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
