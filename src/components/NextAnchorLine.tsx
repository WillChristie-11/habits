import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Habit } from '../types';
import { useStore } from '../store';
import { nextAnchor } from '../lib/schedule';
import { formatTime } from '../lib/dates';
import { AnchorCheck, useDoneAnimation } from './AnchorRow';
import { useThemedStyles, type Theme } from '../theme';

/**
 * Slim line on Today with the current or next anchor ("Next · Work block · 10:00 AM").
 * Tap the check to mark it done: the completion animation plays, then the next anchor slides in.
 * Tap the text to open the Schedule tab; long-press it to start the "Get ready" countdown.
 */
export function NextAnchorLine({ onDone, onReady }: { onDone(a: Habit): void; onReady?(a: Habit): void }) {
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, now } = useStore();
  const [finishing, setFinishing] = useState<{ anchor: Habit; label: 'Now' | 'Next' } | null>(null);
  const live = nextAnchor(habits, idx, ctx, now.getHours() * 60 + now.getMinutes());
  const shown = finishing ?? live;
  const { sweep, pop } = useDoneAnimation(!!finishing);

  useEffect(() => {
    if (!finishing) return;
    const t = setTimeout(() => setFinishing(null), 900);
    return () => clearTimeout(t);
  }, [finishing]);

  if (!shown) return null;
  const a = shown.anchor;
  const when = shown.label === 'Now' && a.end_time ? `until ${formatTime(a.end_time)}` : formatTime(a.scheduled_time);

  return (
    <View style={s.row}>
      <Animated.View
        pointerEvents="none"
        style={[s.sweep, { width: sweep.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
      <Pressable
        style={s.body}
        onPress={() => router.push('/schedule')}
        onLongPress={onReady ? () => onReady(a) : undefined}
        delayLongPress={350}
        accessibilityHint="Opens the schedule. Long-press to get ready."
      >
        <Text style={[s.label, shown.label === 'Now' && s.labelNow]}>{shown.label}</Text>
        <Text style={[s.name, finishing && s.nameDone]} numberOfLines={1}>
          {a.name}
        </Text>
        <Text style={s.when}>· {when}</Text>
      </Pressable>
      <Pressable
        hitSlop={10}
        disabled={!!finishing}
        onPress={() => {
          setFinishing(shown);
          onDone(a);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Mark ${a.name} done`}
      >
        <AnchorCheck pop={pop} done={!!finishing} size={26} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingVertical: 8,
      paddingLeft: 14,
      paddingRight: 10,
      borderRadius: 12,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      overflow: 'hidden',
    },
    sweep: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: t.accentSoft },
    body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 12, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    labelNow: { color: t.accent },
    name: { fontSize: 15, fontWeight: '700', color: t.text, flexShrink: 1 },
    nameDone: { color: t.textMuted, textDecorationLine: 'line-through' },
    when: { fontSize: 13, color: t.textMuted, fontVariant: ['tabular-nums'] },
  });
