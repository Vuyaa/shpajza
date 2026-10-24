import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import { getAuthToken, saveAuthToken, saveUser, login, register } from '../services/api';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const refreshSession = async () => {
    const token = await getAuthToken();
    setIsAuthenticated(Boolean(token));
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const logout = async () => {
    await saveAuthToken(null);
    await saveUser(null);
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2f7df6" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Main">
            {(props) => <MainScreen {...props} onLogout={logout} />}
          </Stack.Screen>
          <Stack.Screen name="RecipeDetail">
            {(props) => <RecipeDetailScreen {...(props as any)} onLogout={logout} />}
          </Stack.Screen>
        </>
      ) : (
        <Stack.Screen name="Login">
          {(props) => (
            <LoginScreen
              {...props}
              onLogin={async (email, password) => {
                await login(email, password);
                await refreshSession();
              }}
              onRegister={async (name, email, password) => {
                await register(name, email, password);
                await refreshSession();
              }}
            />
          )}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fb'
  }
});
