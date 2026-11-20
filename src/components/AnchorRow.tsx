import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { DayState, Habit } from '../types';
import { useThemedStyles, type Theme } from '../theme';
import { formatTime } from '../lib/dates';

/**
 * Completion animation shared by anchor rows and the next-anchor line: a tint sweeps
 * across the row, the check pops in, and a success haptic fires.
 */
export function useDoneAnimation(done: boolean) {
  const [sweep] = useState(() => new Animated.Value(done ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(done ? 1 : 0));
  const prev = useRef(done);
  useEffect(() => {
    if (!prev.current && done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      sweep.setValue(0);
      pop.setValue(0);
      Animated.parallel([
        Animated.timing(sweep, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: false }),
      ]).start();
    } else if (prev.current && !done) {
      sweep.setValue(0);
      pop.setValue(0);
    }
    prev.current = done;
  }, [done, sweep, pop]);
  return { sweep, pop };
}

export function AnchorCheck({ pop, done, size = 28 }: { pop: Animated.Value; done: boolean; size?: number }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={[s.check, { width: size, height: size, borderRadius: size / 2 }, done && s.checkDone]}>
      <Animated.Text
        style={[
          s.checkMark,
          { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }], opacity: pop },
        ]}
      >
        ✓
      </Animated.Text>
    </View>
  );
}

interface Props {
  anchor: Habit;
  state: DayState;
  focus?: 'Now' | 'Next' | null;
  /** Show "· 7:00 AM" after the name (Today, where there's no time rail). */
  showTime?: boolean;
  /** single tap: done / undo */
  onToggle(): void;
}

/** An anchor (Wake up, Work). Tap to mark done. Not tracked: no %, no dots, no feeling. */
export function AnchorRow({ anchor, state, focus, showTime, onToggle }: Props) {
  const s = useThemedStyles(makeStyles);
  const done = state === 'done' || state === 'skipped';
  const { sweep, pop } = useDoneAnimation(done);
  // The start time is on the rail beside the card; the card only adds the end.
  const range = anchor.end_time ? `until ${formatTime(anchor.end_time)}` : null;
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [s.row, focus && s.focus, pressed && { transform: [{ scale: 0.985 }] }]}
      accessibilityRole="button"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${anchor.name}${done ? ', done' : ''}`}
      accessibilityHint="Tap to mark done. Swipe for Skip, Get ready, Edit or Delete."
    >
      <Animated.View
        pointerEvents="none"
        style={[s.sweep, { width: sweep.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
      <View style={{ flex: 1 }}>
        <Text style={[s.name, done && s.nameDone]} numberOfLines={1}>
          {anchor.name}
          {showTime && anchor.scheduled_time && (
            <Text style={s.time}>{`  ·  ${formatTime(anchor.scheduled_time)}`}</Text>
          )}
        </Text>
        {(focus || range) && (
          <View style={s.topLine}>
            {focus && (
              <View style={s.pill}>
                <Text style={s.pillText}>{focus}</Text>
              </View>
            )}
            {range && <Text style={s.range}>{range}</Text>}
          </View>
        )}
      </View>
      <AnchorCheck pop={pop} done={done} />
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 60,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: t.surface,
      borderWidth: 1.5,
      borderColor: t.border,
      marginBottom: 8,
      overflow: 'hidden',
    },
    focus: { borderColor: t.accent },
    sweep: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: t.accentSoft },
    topLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
    pill: { backgroundColor: t.accent, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
    pillText: { color: t.onAccent, fontSize: 11, fontWeight: '700' },
    range: { fontSize: 12, color: t.textMuted, fontVariant: ['tabular-nums'] },
    name: { fontSize: 17, fontWeight: '700', color: t.text },
    nameDone: { color: t.textMuted, textDecorationLine: 'line-through' },
    check: {
      borderWidth: 2,
      borderColor: t.dotEmpty,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
    },
    checkDone: { backgroundColor: t.accent, borderColor: t.accent },
    checkMark: { color: t.onAccent, fontSize: 15, fontWeight: '800' },
    time: { fontSize: 15, fontWeight: '500', color: t.textMuted, textDecorationLine: 'none' },
  });
