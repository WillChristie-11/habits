import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { Habit, Priority } from '../types';
import { useStore } from '../store';
import { stateOn } from '../lib/schedule';
import { Button } from '../components/ui';
import { useEndTime } from '../components/useEndTime';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const RING = 240;
const STROKE = 12;

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * "Get ready": a short transition countdown before an item. Wrap up what you're doing, then
 * Start. Avoid habits go straight into their session timer; other habits and activities open a
 * "now doing" view with Done.
 */
type ReadyItem = Pick<
  Habit,
  'id' | 'name' | 'kind' | 'habit_kind' | 'ladder' | 'ladder_index' | 'pair_with' | 'session_minutes' | 'ready_minutes'
>;

/** A priority shown like an item: no ladder or session, a 3-minute get-ready. */
const priorityItem = (p: Priority): ReadyItem => ({
  id: -p.id,
  name: p.text,
  kind: 'habit',
  habit_kind: 'want',
  ladder: [],
  ladder_index: 0,
  pair_with: null,
  session_minutes: 0,
  ready_minutes: 3,
});

export function ReadyScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  // Either a habit / anchor (habitId) or one of Today's priorities (priorityId).
  const params = useLocalSearchParams<{ habitId?: string; priorityId?: string; date?: string }>();
  const { habits, idx, ctx, mark, priorities, togglePriority } = useStore();
  const habit = habits.find((h) => h.id === Number(params.habitId));
  const priority = params.priorityId ? priorities.find((p) => p.id === Number(params.priorityId)) : undefined;
  const item: ReadyItem | undefined = habit ?? (priority ? priorityItem(priority) : undefined);
  const date = params.date ?? ctx.today;

  const [skipped, setSkipped] = useState(false);
  const [doing, setDoing] = useState(false);
  const total = (item?.ready_minutes ?? 3) * 60_000;
  // Saved end time + a notification, so it stays right if the app is backgrounded or closed.
  const timer = useEndTime(
    `ready-${habit ? habit.id : `p${params.priorityId}`}`,
    item ? { title: `Time for ${item.name}`, body: 'Your get-ready countdown is up.' } : null,
  );
  const remaining = skipped ? 0 : (timer.remaining ?? total);
  const ended = remaining === 0;

  const armed = useRef(false);
  useEffect(() => {
    if (!item || armed.current) return;
    armed.current = true;
    if (timer.endsAt == null) timer.start(total);
  }, [item, timer, total]);

  const buzzed = useRef(false);
  useEffect(() => {
    if (ended && !buzzed.current) {
      buzzed.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [ended]);

  const close = () => {
    timer.clear();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (!item) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.name}>This item no longer exists.</Text>
        <View style={{ marginTop: 20, width: 200 }}>
          <Button title="Close" onPress={close} />
        </View>
      </View>
    );
  }

  const avoid = item.kind === 'habit' && item.habit_kind === 'avoid';
  const step = item.ladder[item.ladder_index] ?? null;
  const done = habit ? stateOn(habit, idx, date, ctx) === 'done' : priority?.done_on != null;

  const start = () => {
    timer.clear();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (avoid) {
      router.replace({ pathname: '/timer', params: { habitId: String(item.id), date } });
    } else setDoing(true);
  };

  // "Now doing": check it off / log it when done.
  if (doing) {
    return (
      <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.topBar}>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
            <Text style={s.close}>✕</Text>
          </Pressable>
          <Text style={s.kicker}>Now</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={[s.center, { flex: 1, gap: 8 }]}>
          <Text style={s.bigName}>{item.name}</Text>
          {step && <Text style={s.step}>{step}</Text>}
          {item.pair_with && <Text style={s.pair}>with {item.pair_with}</Text>}
          {done && <Text style={[s.pair, { marginTop: 12 }]}>✓ Done</Text>}
        </View>
        <View style={s.actions}>
          {!done && (
            <Button
              title={item.kind === 'anchor' ? 'Done ✓' : 'Done, check it off ✓'}
              onPress={async () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                if (habit) await mark(habit.id, 'done', date);
                else if (priority && !priority.done_on) await togglePriority(priority);
                close();
              }}
            />
          )}
          <Button kind="secondary" title={done ? 'Close' : 'I’ll check it off later'} onPress={close} />
        </View>
      </View>
    );
  }

  const r = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const fraction = remaining / total; // shrinks to nothing

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.topBar}>
        <View style={{ width: 24 }} />
        <Text style={s.kicker}>Get ready</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.head}>
        <Text style={s.wrap}>Wrap up</Text>
        <Text style={s.then}>
          then: <Text style={s.thenName}>{item.name}</Text>
        </Text>
        {step && <Text style={s.step}>{step}</Text>}
        {item.pair_with && <Text style={s.pair}>with {item.pair_with}</Text>}
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
            {ended ? (
              <Pressable onPress={start} style={s.bigStart} accessibilityRole="button">
                <Text style={s.bigStartText}>Start</Text>
              </Pressable>
            ) : (
              <Text style={s.clock}>{mmss(remaining)}</Text>
            )}
          </View>
        </View>
      </View>

      <View style={s.actions}>
        {ended ? (
          <Button title={avoid ? `Start ${item.session_minutes} min` : 'Start'} onPress={start} />
        ) : (
          <Button title="Start now" onPress={() => setSkipped(true)} />
        )}
        <Button kind="secondary" title="Cancel" onPress={close} />
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
    head: { alignItems: 'center', marginTop: 32, marginBottom: 28, gap: 6 },
    wrap: { fontSize: 30, fontWeight: '700', color: t.text },
    then: { fontSize: 18, color: t.textMuted, textAlign: 'center' },
    thenName: { color: t.text, fontWeight: '700' },
    name: { fontSize: 22, fontWeight: '700', color: t.text, textAlign: 'center' },
    bigName: { fontSize: 32, fontWeight: '700', color: t.text, textAlign: 'center' },
    step: { fontSize: 17, color: t.text, textAlign: 'center' },
    pair: { fontSize: 15, color: t.accent, fontWeight: '600' },
    clock: { fontSize: 52, fontWeight: '700', color: t.text, fontVariant: ['tabular-nums'] },
    bigStart: {
      width: RING - 56,
      height: RING - 56,
      borderRadius: (RING - 56) / 2,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bigStartText: { fontSize: 34, fontWeight: '800', color: t.onAccent },
    actions: { marginTop: 'auto', gap: 10 },
  });
