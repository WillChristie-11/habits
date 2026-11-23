import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { HEAVINESS } from '../lib/insights';
import { FROM_HABIT } from '../lib/timers';
import { useTimerStart } from '../components/useTimerStart';
import { Button } from '../components/ui';
import { useTheme, useThemedStyles, type Theme } from '../theme';

/**
 * "Weigh it": opens before an avoid habit's session timer. How heavy does this feel right now
 * (1 Easy … 5 Dread, optional), THE ONLY STEP with Make it smaller, then Start N min. The number
 * is saved on the session as meta.dreadBefore; nothing here is counted.
 */
export function WeighScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const params = useLocalSearchParams<{ habitId: string; date?: string }>();
  const { habits, setLadder } = useStore();
  const habit = habits.find((h) => h.id === Number(params.habitId));
  const timerStart = useTimerStart();
  const [dread, setDread] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [smaller, setSmaller] = useState('');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!habit) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.h1}>This habit no longer exists.</Text>
        <View style={{ marginTop: 20, width: 200 }}>
          <Button title="Close" onPress={close} />
        </View>
      </View>
    );
  }

  const step = habit.ladder[habit.ladder_index] ?? null;

  /** One rung down if there is one; otherwise ask for a smaller first move. */
  const makeSmaller = () => {
    Haptics.selectionAsync().catch(() => {});
    if (habit.ladder_index > 0) setLadder(habit, habit.ladder, habit.ladder_index - 1);
    else setAsking(true);
  };
  const saveSmaller = async () => {
    const v = smaller.trim();
    if (!v) return setAsking(false);
    // Inserted at the current position, so it becomes the next step and the old one follows it.
    const i = Math.min(habit.ladder_index, habit.ladder.length);
    await setLadder(habit, [...habit.ladder.slice(0, i), v, ...habit.ladder.slice(i)], i);
    setSmaller('');
    setAsking(false);
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // The Focus round is the session: it counts the moment it starts.
    timerStart('focus', FROM_HABIT.focus, habit.id, { dread, replace: true });
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.topBar}>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
          <Text style={s.close}>✕</Text>
        </Pressable>
        <Text style={s.kicker}>{habit.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>How heavy does this feel right now?</Text>
        <View style={s.scale}>
          {HEAVINESS.map((label, i) => {
            const on = dread === i + 1;
            return (
              <Pressable
                key={label}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setDread(on ? null : i + 1);
                }}
                style={[s.opt, on && s.optOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${i + 1} ${label}`}
              >
                <Text style={[s.optNum, on && s.optTextOn]}>{i + 1}</Text>
                <Text style={[s.optLabel, on && s.optTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>The only step</Text>
          <Text style={s.step}>{step ?? `Focus ${FROM_HABIT.focus} on ${habit.name.toLowerCase()}`}</Text>
          {asking ? (
            <View style={{ gap: 8, marginTop: 10 }}>
              <Text style={s.ask}>What’s a smaller first move?</Text>
              <TextInput
                value={smaller}
                onChangeText={setSmaller}
                onSubmitEditing={saveSmaller}
                autoFocus
                placeholder="e.g. open the document"
                placeholderTextColor={t.textMuted}
                keyboardAppearance={t.dark ? 'dark' : 'light'}
                returnKeyType="done"
                maxLength={80}
                style={s.input}
              />
              <View style={s.row}>
                <Pressable onPress={() => setAsking(false)} hitSlop={8}>
                  <Text style={s.link}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveSmaller} hitSlop={8}>
                  <Text style={[s.link, s.linkStrong]}>Make this the next step</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={makeSmaller} hitSlop={8} style={{ marginTop: 10 }} accessibilityRole="button">
              <Text style={[s.link, s.linkStrong]}>Make it smaller</Text>
            </Pressable>
          )}
        </View>

        <Text style={s.permission}>You can stop when the timer ends. Stopping counts.</Text>
        {habit.pair_with && <Text style={s.pair}>with {habit.pair_with}</Text>}
      </ScrollView>

      <Button title={`Focus · ${FROM_HABIT.focus}`} onPress={start} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background, paddingHorizontal: 24 },
    center: { alignItems: 'center', justifyContent: 'center' },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    close: { fontSize: 20, color: t.textMuted, width: 24 },
    kicker: { fontSize: 13, fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    content: { paddingTop: 28, paddingBottom: 24, gap: 18 },
    h1: { fontSize: 24, fontWeight: '700', color: t.text, lineHeight: 30 },
    scale: { flexDirection: 'row', gap: 6 },
    opt: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: t.muted },
    optOn: { backgroundColor: t.accent },
    optNum: { fontSize: 18, fontWeight: '700', color: t.text },
    optLabel: { fontSize: 11, color: t.textMuted, marginTop: 2 },
    optTextOn: { color: t.onAccent },
    card: { backgroundColor: t.surface, borderRadius: 16, padding: 16 },
    cardLabel: { fontSize: 12, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    step: { fontSize: 22, fontWeight: '600', color: t.text, marginTop: 6, lineHeight: 28 },
    ask: { fontSize: 15, color: t.text, fontWeight: '600' },
    input: {
      backgroundColor: t.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: t.text,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    link: { fontSize: 15, color: t.textMuted },
    linkStrong: { color: t.accent, fontWeight: '600' },
    permission: { fontSize: 15, color: t.textMuted, lineHeight: 21 },
    pair: { fontSize: 15, color: t.text },
  });
