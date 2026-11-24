import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StoreProvider, useStore } from '../store';
import { useTheme } from '../theme';
import { NotificationBridge } from '../components/NotificationBridge';
import { NowGate } from '../components/NowGate';

// The tabs are always the base of the stack; modals (Now included) are presented over them.
export const unstable_settings = { anchor: '(tabs)' };

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
      <NowGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reminders" options={{ presentation: 'modal' }} />
        <Stack.Screen name="now" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="tempted" options={{ presentation: 'modal' }} />
        <Stack.Screen name="close" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
        <Stack.Screen name="goal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="goals" options={{ presentation: 'modal' }} />
        <Stack.Screen name="nottoday" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notlanding" options={{ presentation: 'modal' }} />
        <Stack.Screen name="focus" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="meditate" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="weigh" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoreProvider>
        <ThemedStack />
      </StoreProvider>
    </GestureHandlerRootView>
  );
}
