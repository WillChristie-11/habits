import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useStore, type ActiveTimer } from '../store';
import { stateOn } from '../lib/schedule';
import { FOCUS_END_CATEGORY } from '../lib/notifications';
import { DEFAULT_MINUTES, breakMinutes, clock, focusRound } from '../lib/timers';
import { useEndTime } from '../components/useEndTime';
import { TimerVideo } from '../components/TimerVideo';
import { FeelingPicker } from '../components/FeelingPicker';
import { AvoidAfterCard } from '../components/AvoidAfterCard';
import { themes, type Theme } from '../theme';

const KEEP_AWAKE_TAG = 'focus';
const dark = themes.midnight as unknown as Theme; // Focus is dark whatever the app theme

/**
 * Focus (pomodoro). Dark whatever the theme: the clock video fades into the background, then
 * "Focus · round 2 of 4", time left, the focus line, round dots and a thin progress bar. The end
 * time is saved (useEndTime), with a notification "Focus done. Break 5 min?" (Break · Keep going ·
 * Done). Every 4th break in a day is 15 min. Not tracked unless linked to a habit.
 */
export function FocusScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const s = useMemo(() => makeStyles(dark), []);
  const params = useLocalSearchParams<{
    startId?: string;
    minutes?: string;
    habitId?: string;
    action?: string;
    dread?: string;
  }>();
  const store = useStore();
  const { settings, updateSettings, focusLog, addFocusRound, habits, idx, ctx, mark, startSession, rateFeeling } =
    store;
  const active = settings.activeTimer?.kind === 'focus' ? settings.activeTimer : null;
  const timer = useEndTime('focus', null);
  // "Keep going" belongs to one round (keyed by its start), so a new round resets it on its own.
  // From the notification's Keep going button it's on from the start.
  const [keepFor, setKeepFor] = useState<string | null>(
    params.action === 'focus-keep' ? (settings.activeTimer?.startedAt ?? null) : null,
  );
  const keepGoing = keepFor != null && keepFor === settings.activeTimer?.startedAt;
  const setKeepGoing = (on: boolean) => setKeepFor(on ? (settings.activeTimer?.startedAt ?? null) : null);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [line, setLine] = useState(active?.line ?? '');
  const roundsToday = focusLog.filter((r) => r.date === ctx.today).length;
  const habit = active?.habitId != null ? habits.find((h) => h.id === active.habitId) : undefined;
  const avoidHabit = habit?.kind === 'habit' && habit.habit_kind === 'avoid' ? habit : undefined;
  // Avoid habit: "How heavy was it actually?" once per round, at its end or when stopping early.
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const save = (patch: Partial<ActiveTimer> | null) =>
    updateSettings({ activeTimer: patch && active ? { ...active, ...patch } : (patch as ActiveTimer | null) });

  const startRound = (base: Omit<ActiveTimer, 'phase' | 'startedAt'>) => {
    const next: ActiveTimer = { ...base, phase: 'focus', startedAt: new Date().toISOString() };
    updateSettings({ activeTimer: next });
    const brk = breakMinutes(roundsToday + 1);
    timer.start(next.minutes * 60_000, {
      title: `Focus done. Break ${brk} min?`,
      body: next.line ? next.line : 'Break, keep going, or call it done.',
      category: FOCUS_END_CATEGORY,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // A new start (from the Timers screen, the hold, or a linked habit); reopening resumes.
  const begun = useRef(false);
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    if (!params.startId || active?.startId === params.startId) return;
    const habitId = params.habitId ? Number(params.habitId) : null;
    const h = habitId != null ? habits.find((x) => x.id === habitId) : undefined;
    // Avoid habit: the round is its session and counts the moment it starts.
    if (h?.habit_kind === 'avoid')
      startSession(h, ctx.today, params.dread ? { dreadBefore: Number(params.dread) } : null);
    startRound({
      kind: 'focus',
      minutes: Number(params.minutes) || DEFAULT_MINUTES.focus,
      habitId,
      line: '',
      startId: params.startId,
    });
    // once, on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The round ends: log it once, success haptic; a linked want habit is checked off.
  useEffect(() => {
    if (!active || !timer.ended) return;
    if (active.phase === 'focus') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      save({ phase: 'focusDone' });
      addFocusRound(active.minutes, active.startedAt, active.habitId);
      if (habit && habit.habit_kind === 'want' && stateOn(habit, idx, ctx.today, ctx) !== 'done') {
        mark(habit.id, 'done', ctx.today).then(() => setFeeling(habit.id));
      }
    } else if (active.phase === 'break') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      save({ phase: 'breakDone' });
    }
    // phase changes only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.ended, active?.phase]);

  // Keep screen on while a round runs (toggle, on by default).
  const awake = settings.timerPrefs.keepAwake && active?.phase === 'focus';
  useEffect(() => {
    if (!awake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [awake]);

  const finishAll = () => {
    timer.clear();
    updateSettings({ activeTimer: null });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const startBreak = () => {
    if (!active) return;
    const brk = breakMinutes(roundsToday);
    save({ phase: 'break' });
    timer.start(brk * 60_000, { title: 'Break’s over. Another round?', body: 'Start focus, or call it done.' });
  };

  // Buttons tapped on the "Focus done" notification.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !params.action || !active) return;
    handled.current = true;
    if (params.action === 'focus-break' && active.phase !== 'break') startBreak();
    else if (params.action === 'focus-done') finishAll();
    // once per notification
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.action, active]);

  if (!active) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <Text style={s.status}>No Focus timer running.</Text>
        <Pressable onPress={() => router.back()} style={[s.btn, s.btnPrimary, { marginTop: 20 }]}>
          <Text style={[s.btnText, s.btnPrimaryText]}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const inBreak = active.phase === 'break' || active.phase === 'breakDone';
  const done = active.phase === 'focusDone';
  // Dots: the round running now, or the one just finished.
  const finishedInSet = done || inBreak ? ((roundsToday - 1) % 4) + 1 : focusRound(roundsToday).filled;
  const round = done || inBreak ? finishedInSet : focusRound(roundsToday).round;
  const total = (inBreak ? breakMinutes(roundsToday) : active.minutes) * 60_000;
  const left = timer.remaining ?? total;
  const over = timer.endsAt != null ? Math.max(0, timer.now - timer.endsAt) : 0;
  const progress = 1 - left / total;
  const videoSize = width;

  const askAvoid = !!avoidHabit && askedFor !== active.startedAt && (done || stopping);
  const stop = () =>
    Alert.alert('End this round?', avoidHabit ? 'Stopping early still counts.' : undefined, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'End it',
        style: 'destructive',
        onPress: () => (avoidHabit && askedFor !== active.startedAt ? setStopping(true) : finishAll()),
      },
    ]);
  const avoidDone = () => {
    setAskedFor(active.startedAt);
    if (stopping) finishAll();
  };
  const step = habit ? habit.ladder[habit.ladder_index] : undefined;

  // When a round or break has ended the screen asks what's next: less video, room for the buttons.
  const asking = (done && !keepGoing) || active.phase === 'breakDone';

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style="light" />
      <View style={{ width: videoSize, height: videoSize * (asking ? 0.62 : 0.82), overflow: 'hidden' }}>
        <TimerVideo kind="focus" mode={active.phase === 'focus' || (done && keepGoing) ? 'play' : 'pause'} />
        {inBreak && <View style={[StyleSheet.absoluteFill, s.dim]} />}
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
          <Defs>
            <LinearGradient id="focus-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={dark.background} stopOpacity="0.55" />
              <Stop offset="0.25" stopColor={dark.background} stopOpacity="0" />
              <Stop offset="0.6" stopColor={dark.background} stopOpacity="0" />
              <Stop offset="1" stopColor={dark.background} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill="url(#focus-fade)" />
        </Svg>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[s.hide, { top: insets.top + 8 }]}
          accessibilityLabel="Hide the timer (it keeps running)"
        >
          <Text style={s.hideText}>⌄</Text>
        </Pressable>
      </View>

      <View style={s.body}>
        <Text style={s.kicker}>{inBreak ? 'Break' : `Focus · round ${round} of 4`}</Text>
        <Text style={[s.clock, left <= 0 && !(keepGoing && done) && s.clockWords]}>
          {keepGoing && done ? `+${clock(over)}` : left > 0 ? clock(left) : inBreak ? 'Break’s over' : 'Focus done'}
        </Text>
        {habit ? (
          <View style={s.habitInfo}>
            <Text style={s.habitName}>{habit.name}</Text>
            {step ? <Text style={s.habitLine}>Next: {step}</Text> : null}
            {habit.pair_with ? <Text style={s.habitLine}>With {habit.pair_with}</Text> : null}
          </View>
        ) : (
          <TextInput
            value={line}
            onChangeText={setLine}
            onEndEditing={() => save({ line: line.trim() })}
            placeholder="What are you focusing on?"
            placeholderTextColor={dark.textMuted}
            keyboardAppearance="dark"
            returnKeyType="done"
            maxLength={80}
            style={s.line}
            accessibilityLabel="What are you focusing on? (optional)"
          />
        )}
        <View style={s.dots} accessibilityLabel={`Round ${round} of 4`}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[s.dotItem, i < finishedInSet || (i === round - 1 && !inBreak && !done) ? s.dotOn : null]}
            />
          ))}
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
        </View>
        {!asking && (
          <View style={s.awakeRow}>
            <Text style={s.awakeText}>Keep screen on</Text>
            <Switch
              value={settings.timerPrefs.keepAwake}
              onValueChange={(v) => updateSettings({ timerPrefs: { ...settings.timerPrefs, keepAwake: v } })}
              trackColor={{ true: dark.accent, false: dark.muted }}
            />
          </View>
        )}
      </View>

      <View style={s.actions}>
        {active.phase === 'focus' && <Button s={s} label="Stop" onPress={stop} />}
        {done && (
          <>
            <Button s={s} label={`Break ${breakMinutes(roundsToday)} min`} primary onPress={startBreak} />
            {!keepGoing && <Button s={s} label="Keep going" onPress={() => setKeepGoing(true)} />}
            <Button s={s} label="Done" onPress={finishAll} />
          </>
        )}
        {active.phase === 'break' && <Button s={s} label="Done" onPress={finishAll} />}
        {active.phase === 'breakDone' && (
          <>
            <Text style={s.prompt}>Another round?</Text>
            <Button
              s={s}
              label="Start focus"
              primary
              onPress={() =>
                startRound({
                  kind: 'focus',
                  minutes: active.minutes,
                  habitId: active.habitId,
                  line: active.line,
                  startId: active.startId,
                })
              }
            />
            <Button s={s} label="Done" onPress={finishAll} />
          </>
        )}
      </View>

      {askAvoid && avoidHabit && (
        <AvoidAfterCard habit={avoidHabit} date={ctx.today} autoDismiss={false} onDismiss={avoidDone} />
      )}
      {feeling != null && habit && (
        <FeelingPicker
          title={`How do you feel after ${habit.name}?`}
          feelings
          note={false}
          autoDismiss={settings.feelingAutoDismiss}
          onPick={(f) => rateFeeling(habit.id, f, ctx.today)}
          onNote={() => {}}
          onDismiss={() => setFeeling(null)}
        />
      )}
    </View>
  );
}

function Button({
  s,
  label,
  onPress,
  primary,
}: {
  s: ReturnType<typeof makeStyles>;
  label: string;
  onPress(): void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.btn, primary && s.btnPrimary, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <Text style={[s.btnText, primary && s.btnPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    status: { color: t.text, fontSize: 17 },
    dim: { backgroundColor: t.background, opacity: 0.55 },
    hide: { position: 'absolute', left: 18, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hideText: { color: t.text, fontSize: 30, lineHeight: 30 },
    body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, marginTop: -24, gap: 10 },
    kicker: { color: t.textMuted, fontSize: 14, fontWeight: '600', letterSpacing: 0.4 },
    clock: { color: t.text, fontSize: 72, fontWeight: '200', fontVariant: ['tabular-nums'] },
    clockWords: { fontSize: 40, marginVertical: 16 },
    line: { color: t.text, fontSize: 17, textAlign: 'center', alignSelf: 'stretch', paddingVertical: 4 },
    habitInfo: { alignItems: 'center', gap: 2 },
    habitName: { color: t.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
    habitLine: { color: t.textMuted, fontSize: 15, textAlign: 'center' },
    dots: { flexDirection: 'row', gap: 8, marginTop: 4 },
    dotItem: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: t.textMuted },
    dotOn: { backgroundColor: t.accent, borderColor: t.accent },
    track: {
      alignSelf: 'stretch',
      height: 3,
      borderRadius: 2,
      backgroundColor: t.muted,
      marginTop: 8,
      overflow: 'hidden',
    },
    fill: { height: 3, backgroundColor: t.accent },
    awakeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    awakeText: { color: t.textMuted, fontSize: 14 },
    actions: { paddingHorizontal: 24, gap: 10 },
    prompt: { color: t.text, fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
    btn: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: t.surface },
    btnPrimary: { backgroundColor: t.accent },
    btnText: { color: t.text, fontSize: 16, fontWeight: '600' },
    btnPrimaryText: { color: t.onAccent },
  });
