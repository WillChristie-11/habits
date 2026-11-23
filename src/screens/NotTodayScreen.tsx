import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { REASONS, followUp, withNextStep, type NotTodayReason } from '../lib/notToday';
import { expectedFeltText, expectedVsFelt } from '../lib/insights';
import { PairDots } from '../components/AvoidAfterCard';
import { Button, Input } from '../components/ui';
import { useTheme, useThemedStyles, type Theme } from '../theme';

/**
 * Not today (sheet): "Not today is allowed. What's in the way?" Six reasons; some ask one more
 * thing (a first step for tomorrow, a smaller step) or show the expected-vs-felt record.
 * Saving marks the habit skipped for the day; nothing is counted against it.
 */
export function NotTodayScreen() {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const params = useLocalSearchParams<{ habitId: string; date?: string; reason?: string }>();
  const { habits, idx, ctx, passToday, setLadder } = useStore();
  const habit = habits.find((h) => h.id === Number(params.habitId));
  const date = params.date ?? ctx.today;
  const [reason, setReason] = useState<NotTodayReason | null>(
    REASONS.some((r) => r.key === params.reason) ? (params.reason as NotTodayReason) : null,
  );
  const [text, setText] = useState('');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!habit) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.body}>This habit no longer exists.</Text>
        <Button title="Close" onPress={close} />
      </View>
    );
  }

  const save = async (r: NotTodayReason | null, note: string | null = null) => {
    Haptics.selectionAsync().catch(() => {});
    await passToday(habit, date, r, note);
    close();
  };
  const addStep = async (step: string) => {
    if (step.trim()) {
      const next = withNextStep(habit.ladder, habit.ladder_index, step);
      await setLadder(habit, next.ladder, next.index);
    }
  };
  const pick = (r: NotTodayReason) => {
    if (followUp(r) === 'none') return save(r);
    setText('');
    setReason(r);
  };

  const record = expectedVsFelt(habit, idx);
  const lower = habit.ladder_index > 0 ? habit.ladder[habit.ladder_index - 1] : null;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.bar}>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={s.link}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={s.kicker}>{habit.name}</Text>
      <Text style={s.title}>Not today is allowed. What’s in the way?</Text>

      {!reason && (
        <View style={s.list}>
          {REASONS.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => pick(r.key)}
              style={({ pressed }) => [s.reason, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
            >
              <Text style={s.reasonText}>{r.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => save(null)} hitSlop={8} style={{ marginTop: 8 }} accessibilityRole="button">
            <Text style={s.link}>Just skip today</Text>
          </Pressable>
        </View>
      )}

      {reason && followUp(reason) === 'firstStep' && (
        <View style={s.list}>
          <Text style={s.body}>What’s the very first thing you’d need to know or find?</Text>
          <Input value={text} onChangeText={setText} autoFocus placeholder="e.g. Find last year’s login" />
          <Text style={s.hint}>It becomes tomorrow’s step.</Text>
          <Button title="Save" onPress={async () => (await addStep(text), save(reason))} />
        </View>
      )}

      {reason && followUp(reason) === 'smaller' && (
        <View style={s.list}>
          {lower && (
            <Button
              kind="secondary"
              title={`Step down to: ${lower}`}
              onPress={async () => (await setLadder(habit, habit.ladder, habit.ladder_index - 1), save(reason))}
            />
          )}
          <Text style={s.body}>{lower ? 'Or a 2-minute version:' : 'What would a 2-minute version be?'}</Text>
          <Input value={text} onChangeText={setText} placeholder="e.g. Open the folder" />
          <Button title="Save" onPress={async () => (await addStep(text), save(reason))} />
        </View>
      )}

      {reason && followUp(reason) === 'restUntilMorning' && (
        <View style={s.list}>
          <Text style={s.body}>Rest. The next ask comes tomorrow morning.</Text>
          <Button title="OK" onPress={() => save(reason)} />
        </View>
      )}

      {reason && followUp(reason) === 'record' && (
        <View style={s.list}>
          {record.latest ? (
            <>
              <Text style={s.body}>How it went before: {expectedFeltText(record.latest)}.</Text>
              <PairDots pairs={record.pairs} hollow={t.textMuted} filled={t.accent} track={t.border} />
              <Text style={s.hint}>Hollow: how heavy it looked. Filled: how it felt.</Text>
            </>
          ) : (
            <Text style={s.body}>Nothing rated yet. After the next session this shows how heavy it actually felt.</Text>
          )}
          <Button title="OK" onPress={() => save(reason)} />
        </View>
      )}

      {reason && followUp(reason) === 'note' && (
        <View style={s.list}>
          <Input value={text} onChangeText={setText} autoFocus placeholder="What’s in the way? (optional)" />
          <Button title="Save" onPress={() => save(reason, text)} />
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    center: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    content: { padding: 20, paddingBottom: 48 },
    bar: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 16 },
    link: { fontSize: 16, color: t.textMuted },
    kicker: { fontSize: 14, color: t.textMuted },
    title: { fontSize: 22, fontWeight: '700', color: t.text, marginTop: 4, marginBottom: 16 },
    list: { gap: 10 },
    reason: { backgroundColor: t.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
    reasonText: { fontSize: 16, color: t.text },
    body: { fontSize: 16, color: t.text, lineHeight: 22 },
    hint: { fontSize: 13, color: t.textMuted },
  });
