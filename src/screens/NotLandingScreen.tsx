import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { usualTimes, voiceOf, type Voice } from '../lib/nudges';
import { withNextStep } from '../lib/notToday';
import { addDays, formatTime } from '../lib/dates';
import { Button, Chip, Input } from '../components/ui';
import { useThemedStyles, type Theme } from '../theme';

const VOICES: { key: Voice; label: string }[] = [
  { key: 'gentle', label: 'Gentler' },
  { key: 'direct', label: 'More direct' },
  { key: 'facts', label: 'Just the facts' },
];
const QUIET_DAYS = 7;

/**
 * Not landing (after 3 untouched nudges in a row for one habit): pick what to change. Every
 * choice starts the count again; until then that habit gets no nudges.
 */
export function NotLandingScreen() {
  const s = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ habitId: string }>();
  const { habits, ctx, settings, setHabitMeta, setLadder } = useStore();
  const habit = habits.find((h) => h.id === Number(params.habitId));
  const [open, setOpen] = useState<'time' | 'step' | 'voice' | null>(null);
  const [step, setStep] = useState('');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!habit) return null;

  const choose = async (patch: Record<string, unknown>) => {
    Haptics.selectionAsync().catch(() => {});
    await setHabitMeta(habit.id, { ...patch, nudgeResetAt: new Date().toISOString() });
    close();
  };
  const times = usualTimes(settings.appOpens);
  const voice = voiceOf(habit);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={close} hitSlop={12} accessibilityRole="button" style={{ marginBottom: 16 }}>
        <Text style={s.link}>Not now</Text>
      </Pressable>
      <Text style={s.title}>The {habit.name} nudges haven’t been landing.</Text>
      <Text style={s.body}>They’re paused for now. What would help?</Text>

      <Option s={s} label="A different time" onPress={() => setOpen(open === 'time' ? null : 'time')} />
      {open === 'time' && (
        <View style={s.detail}>
          {times.length ? (
            <>
              <Text style={s.hint}>You usually open the app around:</Text>
              <View style={s.chips}>
                {times.map((t) => (
                  <Chip key={t} label={formatTime(t)} active={false} onPress={() => choose({ nudgeTime: t })} />
                ))}
              </View>
            </>
          ) : (
            <Text style={s.hint}>Your usual times show here after you’ve opened the app a few more times.</Text>
          )}
        </View>
      )}

      <Option s={s} label="A smaller first step" onPress={() => setOpen(open === 'step' ? null : 'step')} />
      {open === 'step' && (
        <View style={s.detail}>
          <Input value={step} onChangeText={setStep} autoFocus placeholder="What’s a smaller first move?" />
          <Button
            title="Save"
            onPress={async () => {
              if (step.trim()) {
                const next = withNextStep(habit.ladder, habit.ladder_index, step);
                await setLadder(habit, next.ladder, next.index);
              }
              await choose({});
            }}
          />
        </View>
      )}

      <Option s={s} label="A different voice" onPress={() => setOpen(open === 'voice' ? null : 'voice')} />
      {open === 'voice' && (
        <View style={[s.detail, s.chips]}>
          {VOICES.map((v) => (
            <Chip key={v.key} label={v.label} active={voice === v.key} onPress={() => choose({ voice: v.key })} />
          ))}
        </View>
      )}

      <Option
        s={s}
        label="Quiet for a week"
        note="It stays on Today, with no notifications."
        onPress={() => choose({ nudgesPausedUntil: addDays(ctx.today, QUIET_DAYS - 1) })}
      />
    </ScrollView>
  );
}

function Option({
  s,
  label,
  note,
  onPress,
}: {
  s: ReturnType<typeof makeStyles>;
  label: string;
  note?: string;
  onPress(): void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.option, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
    >
      <Text style={s.optionText}>{label}</Text>
      {note && <Text style={s.hint}>{note}</Text>}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    content: { padding: 20, paddingBottom: 48, gap: 10 },
    link: { fontSize: 16, color: t.textMuted },
    title: { fontSize: 22, fontWeight: '700', color: t.text },
    body: { fontSize: 16, color: t.textMuted, marginBottom: 8 },
    option: { backgroundColor: t.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
    optionText: { fontSize: 16, color: t.text, fontWeight: '600' },
    detail: { gap: 10, paddingHorizontal: 4, paddingBottom: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hint: { fontSize: 14, color: t.textMuted },
  });
