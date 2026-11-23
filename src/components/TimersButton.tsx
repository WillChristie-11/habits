import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { DEFAULT_MINUTES } from '../lib/timers';
import { useTimerStart } from './useTimerStart';
import { useThemedStyles, type Theme } from '../theme';

/** Outlined "Timers" beside Reset. Tap: the Timers screen. Hold: start the last timer again. */
export function TimersButton() {
  const s = useThemedStyles(makeStyles);
  const { settings } = useStore();
  const start = useTimerStart();
  return (
    <Pressable
      onPress={() => router.push('/timers')}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        const last = settings.lastTimer ?? { kind: 'focus' as const, minutes: DEFAULT_MINUTES.focus };
        start(last.kind, last.minutes);
      }}
      delayLongPress={400}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel="Timers: Focus and Meditate"
      accessibilityHint="Hold to start the last timer again"
    >
      <View style={s.face}>
        <View style={s.hand} />
      </View>
      <Text style={s.text}>Timers</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1.5,
      borderColor: t.accent,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    face: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: t.accent, alignItems: 'center' },
    hand: { width: 1.5, height: 5, backgroundColor: t.accent, marginTop: 2 },
    text: { fontSize: 14, fontWeight: '600', color: t.accent },
  });
