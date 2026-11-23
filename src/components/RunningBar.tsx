import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { runningText, timerName } from '../lib/timers';
import { useThemedStyles, type Theme } from '../theme';

/** While Focus or Meditate runs: a slim bar above the tab bar on every tab; tap to go back to it. */
export function RunningBar() {
  const s = useThemedStyles(makeStyles);
  const { settings } = useStore();
  const active = settings.activeTimer;
  const endsAt = active ? (settings.timers[active.kind] ?? null) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;

  const left = endsAt != null ? Math.max(0, endsAt - now) : 0;
  const phase = active.phase === 'break' || active.phase === 'breakDone' ? 'break' : 'focus';
  const text =
    left > 0
      ? runningText(active.kind, phase, left)
      : active.phase === 'break' || active.phase === 'breakDone'
        ? 'Break’s over · another round?'
        : `${timerName(active.kind)} · done`;
  return (
    <Pressable
      onPress={() => router.push(active.kind === 'focus' ? '/focus' : '/meditate')}
      style={({ pressed }) => [s.bar, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Open the timer`}
    >
      <View style={s.dot} />
      <Text style={s.text} numberOfLines={1}>
        {text}
      </Text>
      <Text style={s.open}>Open</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: t.rowHighlight,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent },
    text: { flex: 1, fontSize: 14, fontWeight: '600', color: t.text, fontVariant: ['tabular-nums'] },
    open: { fontSize: 13, fontWeight: '600', color: t.accent },
  });
