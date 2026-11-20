import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useThemedStyles, type Theme } from '../theme';

/** Outlined "Reset" with a small breathing-circle icon; opens Just Start / Clear Head / Switching. */
export function ResetButton() {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={() => router.push('/reset')}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel="Reset: Just Start, Clear Head or Switching tasks"
    >
      <View style={s.ring}>
        <View style={s.dot} />
      </View>
      <Text style={s.text}>Reset</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderColor: t.accent,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    ring: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.accent,
    },
    text: { fontSize: 14, fontWeight: '600', color: t.accent },
  });
