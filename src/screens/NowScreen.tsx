import React, { useEffect, useState } from 'react';
import { useShowHints } from '../components/useShowHints';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { nowContent, type NowAction } from '../lib/now';
import { weekStart } from '../lib/dates';
import { FROM_HABIT } from '../lib/timers';
import { useHabitTimer } from '../components/useHabitTimer';
import { useTimerStart } from '../components/useTimerStart';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const RING = 150;
const STROKE = 4;

/**
 * The Now page: shown when the app opens (or comes back after 5+ minutes away). One large line,
 * one small line, at most two buttons (three in free time), the weekly intention at the bottom.
 * Tap anywhere or swipe up for Today.
 */
export function NowScreen() {
  const showHints = useShowHints();
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { habits, idx, ctx, settings, weeks, mark } = useStore();
  const habitTimer = useHabitTimer();
  const timerStart = useTimerStart();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const intention = weeks[weekStart(ctx.today)] ?? null;
  const c = nowContent({ habits, idx, ctx, now, r: settings.reminders, intention });
  // Close by dismissing this modal (navigating to '/' from inside it would push a second set of
  // tabs as a card on top).
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
    if (a.kind === 'journal') {
      toToday();
      return void setTimeout(() => router.navigate('/journal'), 350);
    }
    toToday();
    // Let the page close before the timer (or the heavy question) opens.
    setTimeout(() => {
      if (a.kind === 'focus') return timerStart('focus', FROM_HABIT.focus);
      const h = habits.find((x) => x.id === a.habitId);
      if (h) habitTimer(h, a.which);
    }, 350);
  };

  const left = c.ring
    ? Math.max(0, Math.min(1, (c.ring.end - (now.getHours() * 60 + now.getMinutes())) / (c.ring.end - c.ring.start)))
    : 0;
  const r = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <View style={[s.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]} {...swipe.panHandlers}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Pressable style={StyleSheet.absoluteFill} onPress={toToday} accessibilityLabel="Go to Today" />
      <View style={s.middle} pointerEvents="box-none">
        {c.ring && (
          <Svg width={RING} height={RING} style={{ marginBottom: 24 }}>
            <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={t.border} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={t.accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ}`}
              strokeDashoffset={circ * (1 - left)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
        )}
        <Text style={s.big}>{c.big}</Text>
        {c.small && <Text style={s.small}>{c.small}</Text>}
        {c.item && c.kind === 'anchor' && <Text style={s.item}>Next: {c.item}</Text>}
        {c.actions.length > 0 && (
          <View style={[s.actions, c.kind === 'free' && s.stack]} pointerEvents="box-none">
            {c.actions.map((a, i) => (
              <Pressable
                key={`${a.kind}-${a.label}`}
                onPress={() => run(a)}
                style={({ pressed }) => [s.btn, i === 0 && c.kind !== 'free' && s.primary, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <Text style={[s.btnText, i === 0 && c.kind !== 'free' && s.primaryText]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {intention && c.kind !== 'morning' && (
        <Text style={s.intention} numberOfLines={2} pointerEvents="none">
          This week is for {intention}
        </Text>
      )}
      {showHints && (
        <Text style={s.hint} pointerEvents="none">
          Tap or swipe up for Today
        </Text>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background, paddingHorizontal: 28 },
    middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    big: { fontSize: 34, fontWeight: '300', color: t.text, textAlign: 'center', lineHeight: 42 },
    small: { fontSize: 17, fontWeight: '300', color: t.textMuted, textAlign: 'center' },
    item: { fontSize: 17, fontWeight: '400', color: t.text, textAlign: 'center', marginTop: 8 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
    stack: { flexDirection: 'column', alignSelf: 'stretch' },
    btn: {
      paddingVertical: 13,
      paddingHorizontal: 20,
      borderRadius: 24,
      backgroundColor: t.surface,
      alignItems: 'center',
    },
    primary: { backgroundColor: t.accent },
    btnText: { fontSize: 16, fontWeight: '500', color: t.text },
    primaryText: { color: t.onAccent },
    intention: { fontSize: 14, fontWeight: '300', color: t.textMuted, textAlign: 'center', marginBottom: 8 },
    hint: { fontSize: 12, color: t.textMuted, textAlign: 'center', opacity: 0.7 },
  });
