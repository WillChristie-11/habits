import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useStore } from '../store';
import { lastFourWeeks, stepsTaken } from '../lib/goals';
import { WEEKDAY_NAMES, fromKey, weekday } from '../lib/dates';
import { useThemedStyles, type Theme } from '../theme';

/** A goal's page: why, what's linked to it, and the steps taken in the last 4 weeks. */
export function GoalScreen() {
  const s = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ id: string }>();
  const { goals, habits, idx, ctx, goalSteps, priorities } = useStore();
  const goal = goals.find((g) => g.id === Number(params.id));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!goal) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.body}>This goal no longer exists.</Text>
      </View>
    );
  }
  const linked = habits.filter((h) => goal.links.includes(h.id));
  const steps = stepsTaken(goal, habits, idx, goalSteps, priorities, lastFourWeeks(ctx.today));
  const byDay = steps.reduce<Record<string, string[]>>(
    (m, x) => ({ ...m, [x.date]: [...(m[x.date] ?? []), x.text] }),
    {},
  );

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <Text style={s.barLink}>Close</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/goals', params: { edit: String(goal.id) } })}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={[s.barLink, s.accent]}>Edit</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{goal.name}</Text>
        {goal.why ? <Text style={s.why}>{goal.why}</Text> : null}

        <Text style={s.label}>Linked</Text>
        {linked.length ? (
          linked.map((h) => (
            <Text key={h.id} style={s.body}>
              {h.name}
              <Text style={s.muted}>
                {h.kind === 'activity' ? ' · activity' : h.habit_kind === 'avoid' ? ' · tend to avoid' : ' · habit'}
              </Text>
            </Text>
          ))
        ) : (
          <Text style={s.muted}>Nothing linked yet. Edit to link habits or activities.</Text>
        )}

        <Text style={s.label}>Steps taken, last 4 weeks</Text>
        {steps.length === 0 && <Text style={s.muted}>None yet. Today’s step is a good start.</Text>}
        {Object.entries(byDay).map(([d, list]) => (
          <View key={d} style={s.day}>
            <Text style={s.dayName}>
              {WEEKDAY_NAMES[weekday(d)]} {fromKey(d).getDate()}
            </Text>
            <Text style={s.body}>{list.join(' · ')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    bar: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
    barLink: { fontSize: 17, color: t.textMuted },
    accent: { color: t.accent, fontWeight: '600' },
    content: { paddingHorizontal: 20, paddingBottom: 48, gap: 6 },
    title: { fontSize: 28, fontWeight: '700', color: t.text },
    why: { fontSize: 16, color: t.textMuted, fontStyle: 'italic', marginTop: 4 },
    label: { fontSize: 13, fontWeight: '600', color: t.textMuted, marginTop: 22, marginBottom: 2 },
    body: { fontSize: 16, color: t.text, lineHeight: 22 },
    muted: { fontSize: 15, color: t.textMuted },
    day: { flexDirection: 'row', gap: 10 },
    dayName: { width: 56, fontSize: 15, color: t.textMuted, fontVariant: ['tabular-nums'] },
  });
