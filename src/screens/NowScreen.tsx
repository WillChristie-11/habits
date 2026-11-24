import React, { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { nowContent, type NowAction } from '../lib/now';
import { todaysStep } from '../lib/goals';
import { FROM_HABIT } from '../lib/timers';
import { weekStart } from '../lib/dates';
import { useHabitTimer } from '../components/useHabitTimer';
import { useTimerStart } from '../components/useTimerStart';
import { useShowHints } from '../components/useShowHints';
import { nowPalettes, type NowPalette } from '../theme';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The Now page, in the time of day's colours (amber morning, blue day, violet evening). Morning
 * (A): the goal large, today's step, the first item. During an anchor and in the evening (B):
 * time left large, the next item, Done / Start + Get ready, the goal at the bottom. Free time
 * (C): three picks. Tap anywhere or swipe up for Today.
 */
export function NowScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const showHints = useShowHints();
  const store = useStore();
  const { habits, idx, ctx, settings, goals, goalSteps, priorities, mark, addGoalStep } = store;
  const habitTimer = useHabitTimer();
  const timerStart = useTimerStart();
  const [now, setNow] = useState(() => new Date());
  const [typing, setTyping] = useState(false);
  const [stepText, setStepText] = useState('');
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const goal = goals[0] ?? null;
  const c = nowContent({ habits, idx, ctx, now, r: settings.reminders, goal: goal?.name ?? null });
  const step = todaysStep({
    goals,
    steps: goalSteps,
    priorities,
    habits,
    idx,
    ctx,
    weekStartKey: weekStart(ctx.today),
  });
  const p = nowPalettes[c.tone];
  const s = useMemo(() => makeStyles(p), [p]);

  const toToday = () => (router.canDismiss() ? router.dismiss() : router.replace('/'));
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -15 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy >= -50) return;
        if (router.canDismiss()) router.dismiss();
        else router.replace('/');
      },
    }),
  );

  const run = async (a: NowAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (a.kind === 'done') {
      await mark(a.habitId, 'done', ctx.today);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return toToday();
    }
    toToday();
    // Let the page close before the timer (or the heavy question, or the Journal) opens.
    setTimeout(() => {
      if (a.kind === 'journal') return router.navigate('/journal');
      if (a.kind === 'focus') return timerStart('focus', FROM_HABIT.focus);
      const h = habits.find((x) => x.id === a.habitId);
      if (!h) return;
      if (a.kind === 'getReady') return timerStart('meditate', FROM_HABIT.clearHead, h.id, { clearHead: true });
      habitTimer(h, a.kind === 'timer' ? a.which : 0);
    }, 350);
  };

  const savePick = async () => {
    if (step?.kind === 'none' && stepText.trim()) await addGoalStep(step.goal.id, stepText);
    setStepText('');
    setTyping(false);
  };
  const stepChip =
    step?.kind === 'none' ? (
      typing ? (
        <TextInput
          value={stepText}
          onChangeText={setStepText}
          autoFocus
          placeholder="Today’s step toward it"
          placeholderTextColor={p.muted}
          keyboardAppearance="dark"
          returnKeyType="done"
          onSubmitEditing={savePick}
          onBlur={savePick}
          style={s.stepInput}
          maxLength={120}
        />
      ) : (
        <Pressable onPress={() => setTyping(true)} style={s.pick} accessibilityRole="button">
          <Text style={s.pickPlus}>＋</Text>
          <Text style={s.pickText}>Pick today’s step</Text>
        </Pressable>
      )
    ) : step ? (
      <Text style={s.stepLine} numberOfLines={2}>
        Today’s step: {step.text}
        {step.state === 'done' ? ' · done' : step.state === 'not_today' ? ' · not today' : ''}
      </Text>
    ) : null;

  const main = c.actions.filter((a) => a.kind !== 'journal');
  const journal = c.actions.find((a) => a.kind === 'journal');
  const sun = Math.max(width * 0.95, 340);

  return (
    <View style={s.screen} {...swipe.panHandlers}>
      <StatusBar style="light" />
      {/* The "sun": three circles in the time of day's colours. */}
      <Svg width={width} height={sun} style={StyleSheet.absoluteFill} pointerEvents="none">
        {p.rings.map((color, i) => (
          <Circle key={color} cx={width * 0.85} cy={sun * 0.2} r={sun * (0.72 - i * 0.21)} fill={color} />
        ))}
      </Svg>
      <Pressable style={StyleSheet.absoluteFill} onPress={toToday} accessibilityLabel="Go to Today" />

      <View style={[s.top, { paddingTop: insets.top + 24 }]} pointerEvents="none">
        <Text style={s.topText}>{DAY_NAMES[now.getDay()]}</Text>
        <Text style={s.topText}>{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
      </View>

      <View style={s.body} pointerEvents="box-none">
        {c.kicker && <Text style={s.kicker}>{c.kicker}</Text>}
        <Text style={[s.big, c.layout === 'B' && s.bigTime]} numberOfLines={3} adjustsFontSizeToFit>
          {c.big}
        </Text>
        {c.small && <Text style={s.small}>{c.small}</Text>}
        {c.layout === 'A' && goal && <View style={s.stepWrap}>{stepChip}</View>}

        {c.item && (
          <>
            {c.itemLabel && <Text style={s.itemLabel}>{c.itemLabel}</Text>}
            <View style={s.itemCard} pointerEvents="none">
              <Text style={s.itemText} numberOfLines={2}>
                {c.item.text}
              </Text>
              {c.item.minutes != null && <Text style={s.itemMin}>{c.item.minutes} min</Text>}
            </View>
          </>
        )}

        {c.layout === 'C' ? (
          <View style={s.picks} pointerEvents="box-none">
            {main.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => run(a)}
                style={({ pressed }) => [s.itemCard, pressed && s.pressed]}
                accessibilityRole="button"
              >
                <Text style={s.itemText}>{a.label}</Text>
                <Text style={s.itemMin}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          main.length > 0 && (
            <View style={s.buttons} pointerEvents="box-none">
              {main.map((a, i) => (
                <Pressable
                  key={a.kind}
                  onPress={() => run(a)}
                  style={({ pressed }) => [i === 0 ? s.primary : s.secondary, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={i === 0 ? s.primaryText : s.secondaryText}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          )
        )}
        {journal && (
          <Pressable onPress={() => run(journal)} hitSlop={10} style={s.journal} accessibilityRole="button">
            <Text style={s.journalText}>{journal.label} ›</Text>
          </Pressable>
        )}
      </View>

      {/* The goal at the bottom (layouts B, C and done). */}
      {c.layout !== 'A' && goal && (
        <View style={s.goalCard} pointerEvents="box-none">
          <Text style={s.goalLabel}>Toward</Text>
          <Text style={s.goalName} numberOfLines={1}>
            {goal.name}
          </Text>
          {stepChip}
        </View>
      )}
      {showHints && (
        <Text style={[s.hint, { marginBottom: insets.bottom + 16 }]} pointerEvents="none">
          Swipe up for Today
        </Text>
      )}
    </View>
  );
}

const makeStyles = (p: NowPalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.background, paddingHorizontal: 28 },
    top: { flexDirection: 'row', justifyContent: 'space-between' },
    topText: { fontSize: 17, color: p.muted },
    // Content sits at the bottom of its area, so it never runs under the goal card.
    body: { flex: 1, justifyContent: 'flex-end', paddingTop: 60, paddingBottom: 20 },
    kicker: { fontSize: 17, color: p.muted, marginBottom: 6 },
    big: { fontSize: 52, fontWeight: '400', color: p.text, lineHeight: 60 },
    bigTime: { fontSize: 58, fontWeight: '300', fontVariant: ['tabular-nums'], lineHeight: 66 },
    small: { fontSize: 17, color: p.muted, marginTop: 6 },
    stepWrap: { marginTop: 18, alignItems: 'flex-start' },
    pick: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: p.outline,
      borderRadius: 24,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignSelf: 'flex-start',
    },
    pickPlus: { fontSize: 20, color: p.accent },
    pickText: { fontSize: 16, color: p.text },
    stepInput: {
      fontSize: 17,
      color: p.text,
      borderBottomWidth: 1,
      borderColor: p.outline,
      paddingVertical: 8,
      alignSelf: 'stretch',
    },
    stepLine: { fontSize: 16, color: p.text },
    itemLabel: { fontSize: 15, color: p.muted, marginTop: 28, marginBottom: 10 },
    itemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: p.card,
      borderRadius: 22,
      paddingVertical: 18,
      paddingHorizontal: 20,
    },
    itemText: { flex: 1, fontSize: 20, color: p.text },
    itemMin: { fontSize: 15, color: p.muted },
    picks: { gap: 10, marginTop: 24 },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 14 },
    primary: { flex: 1, backgroundColor: p.accent, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
    primaryText: { fontSize: 17, fontWeight: '700', color: p.onAccent },
    secondary: {
      flex: 1.2,
      borderWidth: 1,
      borderColor: p.outline,
      borderRadius: 28,
      paddingVertical: 16,
      alignItems: 'center',
    },
    secondaryText: { fontSize: 17, color: p.text },
    journal: { marginTop: 18, alignSelf: 'flex-start' },
    journalText: { fontSize: 16, color: p.accent, fontWeight: '600' },
    goalCard: { backgroundColor: p.card, borderRadius: 18, padding: 16, gap: 4, marginBottom: 12 },
    goalLabel: { fontSize: 13, color: p.muted },
    goalName: { fontSize: 18, fontWeight: '600', color: p.text },
    hint: { fontSize: 13, color: p.muted, textAlign: 'center', opacity: 0.8 },
    pressed: { opacity: 0.8 },
  });
