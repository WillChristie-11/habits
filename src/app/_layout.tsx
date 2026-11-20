import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StoreProvider, useStore } from '../store';
import { useTheme } from '../theme';
import { NotificationBridge } from '../components/NotificationBridge';

function ThemedStack() {
  const { ready } = useStore();
  const t = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.background).catch(() => {});
  }, [t.background]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <NotificationBridge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ready" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="timer" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <ThemedStack />
    </StoreProvider>
  );
}
