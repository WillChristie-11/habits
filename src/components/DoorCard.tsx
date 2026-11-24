import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { doorPick, keptLines } from '../lib/insights';
import { weekStart } from '../lib/dates';
import { FROM_HABIT } from '../lib/timers';
import { useHabitTimer } from './useHabitTimer';
import { useThemedStyles, type Theme } from '../theme';

/** Minutes for "Just open it": a short Focus round (stopping early still counts). */
export const DOOR_MINUTES = 2;

/**
 * Today's door, above Priorities: the avoid habit started least this week, its next step as the
 * headline, a line you kept if there is one, and three ways through. Collapses to one line once
 * it's been opened or passed on today; hidden when no avoid habit is due.
 */
export function DoorCard() {
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx } = useStore();
  const habitTimer = useHabitTimer();
  const door = doorPick(habits, idx, ctx, weekStart(ctx.today));
  if (!door) return null;
  const h = door.habit;

  if (door.state !== 'open') {
    return (
      <View style={s.collapsed}>
        <Text style={s.label}>Today’s door</Text>
        <Text style={s.collapsedText} numberOfLines={1}>
          {h.name} · {door.state === 'opened' ? 'opened' : 'not today'}
        </Text>
      </View>
    );
  }

  const step = h.ladder[h.ladder_index];
  const line = keptLines(h, idx)[0];
  const openIt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Through "How heavy does this feel?", then a short Focus round.
    router.push({
      pathname: '/weigh',
      params: { habitId: String(h.id), date: ctx.today, minutes: String(DOOR_MINUTES) },
    });
  };
  return (
    <View style={s.card}>
      <Text style={s.label}>Today’s door</Text>
      <Text style={s.name}>{h.name}</Text>
      <Text style={s.headline}>{step ?? `Open ${h.name.toLowerCase()} and look`}</Text>
      {line && <Text style={s.quote}>“{line.text}”</Text>}
      <Pressable onPress={openIt} style={({ pressed }) => [s.primary, pressed && s.pressed]} accessibilityRole="button">
        <Text style={s.primaryText}>Just open it · {DOOR_MINUTES} min</Text>
      </Pressable>
      <View style={s.row}>
        <Pressable
          onPress={() => habitTimer(h, 0)}
          style={({ pressed }) => [s.secondary, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Text style={s.secondaryText}>Focus · {FROM_HABIT.focus}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/nottoday', params: { habitId: String(h.id), date: ctx.today } })}
          style={({ pressed }) => [s.secondary, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Text style={s.secondaryText}>Not today…</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.surface, borderRadius: 16, padding: 16, marginTop: 12, gap: 6 },
    collapsed: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingHorizontal: 4 },
    label: { fontSize: 12, fontWeight: '700', color: t.textMuted },
    collapsedText: { flex: 1, fontSize: 14, color: t.textMuted },
    name: { fontSize: 14, color: t.textMuted },
    headline: { fontSize: 20, fontWeight: '700', color: t.text },
    quote: { fontSize: 15, fontStyle: 'italic', color: t.textMuted },
    primary: { marginTop: 8, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 8 },
    secondary: { flex: 1, backgroundColor: t.background, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    secondaryText: { color: t.text, fontSize: 15, fontWeight: '600' },
    pressed: { opacity: 0.8 },
  });
