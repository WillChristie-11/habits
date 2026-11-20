import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemedStyles, type Theme } from '../theme';

/** Round ＋ floating bottom-right above the tab bar; opens the Habit / Anchor / Activity chooser. */
export function FloatingAdd({ onPress }: { onPress(): void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.94 }] }]}
      accessibilityRole="button"
      accessibilityLabel="Add a habit, anchor or activity"
    >
      <Text style={s.plus}>＋</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 18,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: t.shadow,
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    plus: { color: t.onAccent, fontSize: 28, fontWeight: '600', marginTop: -2 },
  });
