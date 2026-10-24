import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';

type LoginScreenProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  navigation: any;
};

export default function LoginScreen({ onLogin, onRegister }: LoginScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('demo@shpajza.app');
  const [password, setPassword] = useState('demo123');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const buttonText = useMemo(() => isRegisterMode ? 'Registriraj se' : 'Prijavi se', [isRegisterMode]);

  const handleSubmit = async () => {
    if (!email || !password || (isRegisterMode && !name.trim())) {
      Alert.alert('Nedostaju podaci', 'Unesi email i lozinku.');
      return;
    }

    try {
      setLoading(true);
      if (isRegisterMode) {
        await onRegister(name.trim(), email.trim(), password);
      } else {
        await onLogin(email.trim(), password);
      }
    } catch (error: any) {
      Alert.alert('Greška', error?.message || 'Nešto je pošlo po zlu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Shpajza</Text>
        <Text style={styles.subtitle}>Upravljaj inventarom i receptima</Text>

        {isRegisterMode && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ime i prezime"
            style={styles.input}
          />
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          style={styles.input}
          autoCapitalize="none"
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Lozinka"
          secureTextEntry
          style={styles.input}
        />

        <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Učitavanje...' : buttonText}</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => setIsRegisterMode((value) => !value)}>
          <Text style={styles.secondaryText}>
            {isRegisterMode ? 'Već imaš račun? Prijavi se' : 'Nemaš račun? Registriraj se'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#edf3ff'
  },
  card: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1d4ed8',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 24
  },
  input: {
    borderWidth: 1,
    borderColor: '#dfe7f5',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16
  },
  button: {
    backgroundColor: '#2f7df6',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: 'center'
  },
  secondaryText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600'
  }
});
