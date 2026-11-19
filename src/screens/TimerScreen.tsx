import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { Button } from '../components/ui';
import { cancelTimerEnd, scheduleTimerEnd } from '../lib/notifications';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const RING = 264;
const STROKE = 14;

const mmss = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Full-screen "Start N min" session: a ring that shrinks as time runs out, a clear end
 * (haptic + "Time's up"), then Keep going (counts up) or Finish. Avoid habits were already
 * marked done when the session started; want habits are marked done on Finish.
 */
export function TimerScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const params = useLocalSearchParams<{ habitId: string; date?: string }>();
  const { habits, ctx, startSession, finishSession, advanceLadder } = useStore();
  const habit = habits.find((h) => h.id === Number(params.habitId));
  const date = params.date ?? ctx.today;

  const [startedAt] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(startedAt);
  const [keepGoing, setKeepGoing] = useState(false);
  const total = (habit?.session_minutes ?? 15) * 60_000;
  const elapsed = nowMs - startedAt;
  const remaining = Math.max(0, total - elapsed);
  const ended = remaining === 0;

  // Count the start (avoid habits) and arm the background "time's up" alert, once.
  const started = useRef(false);
  useEffect(() => {
    if (!habit || started.current) return;
    started.current = true;
    startSession(habit, date);
    scheduleTimerEnd(
      habit.id,
      new Date(startedAt + total),
      `Time's up: ${habit.name}`,
      'Nice work. Open the app to keep going or finish.',
    );
  }, [habit, date, startSession, startedAt, total]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const buzzed = useRef(false);
  useEffect(() => {
    if (ended && !buzzed.current) {
      buzzed.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [ended]);

  if (!habit) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.name}>This habit no longer exists.</Text>
        <View style={{ marginTop: 20, width: 200 }}>
          <Button title="Close" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const step = habit.ladder[habit.ladder_index] ?? null;
  const nextStep = habit.ladder[habit.ladder_index + 1] ?? null;

  const close = () => {
    cancelTimerEnd(habit.id);
    router.back();
  };

  const finish = async () => {
    await finishSession(habit, date);
    if (!step) return close();
    Alert.alert(
      'Advance to next step?',
      nextStep ? `You worked on “${step}”. Next would be “${nextStep}”.` : `“${step}” was the last step on the ladder.`,
      [
        { text: 'Not yet', style: 'cancel', onPress: close },
        {
          text: nextStep ? 'Next step' : 'Finish ladder',
          onPress: async () => {
            await advanceLadder(habit);
            close();
          },
        },
      ],
    );
  };

  const r = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const fraction = keepGoing ? 1 : remaining / total; // ring shrinks as time runs out

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.topBar}>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close timer">
          <Text style={s.close}>✕</Text>
        </Pressable>
        <Text style={s.kicker}>{habit.habit_kind === 'avoid' ? 'Started · it counts' : `${habit.session_minutes} min session`}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.head}>
        <Text style={s.name}>{habit.name}</Text>
        {step && <Text style={s.step}>{step}</Text>}
        {habit.pair_with && <Text style={s.pair}>with {habit.pair_with}</Text>}
      </View>

      <View style={s.center}>
        <View style={{ width: RING, height: RING }}>
          <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={t.border} strokeWidth={STROKE} fill="none" />
            {fraction > 0 && (
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                stroke={t.accent}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={circ * (1 - fraction)}
              />
            )}
          </Svg>
          <View style={[StyleSheet.absoluteFill, s.center]}>
            {keepGoing ? (
              <>
                <Text style={s.clock}>+{mmss(elapsed - total)}</Text>
                <Text style={s.clockSub}>past your {habit.session_minutes} min</Text>
              </>
            ) : ended ? (
              <>
                <Text style={[s.clock, { color: t.accent }]}>Done</Text>
                <Text style={s.clockSub}>Time’s up. Nice work.</Text>
              </>
            ) : (
              <>
                <Text style={s.clock}>{mmss(remaining)}</Text>
                <Text style={s.clockSub}>left</Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={s.actions}>
        {ended && !keepGoing ? (
          <>
            <Button title="Finish" onPress={finish} />
            <Button kind="secondary" title="Keep going" onPress={() => setKeepGoing(true)} />
          </>
        ) : keepGoing ? (
          <Button title="Finish" onPress={finish} />
        ) : (
          <Button kind="secondary" title="Finish early" onPress={finish} />
        )}
      </View>
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
    head: { alignItems: 'center', marginTop: 36, marginBottom: 32, gap: 6 },
    name: { fontSize: 28, fontWeight: '700', color: t.text, textAlign: 'center' },
    step: { fontSize: 17, color: t.text, textAlign: 'center' },
    pair: { fontSize: 15, color: t.accent, fontWeight: '600' },
    clock: { fontSize: 56, fontWeight: '700', color: t.text, fontVariant: ['tabular-nums'] },
    clockSub: { fontSize: 15, color: t.textMuted, marginTop: 2 },
    actions: { marginTop: 'auto', gap: 10 },
  });
