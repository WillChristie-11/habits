import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DayState } from '../types';
import { FEELINGS } from '../types';
import { useStore } from '../store';
import { dueLabel, missedTwiceRisk, stateOn, timeline, type Row } from '../lib/schedule';
import { formatTime, last7 } from '../lib/dates';
import { DotRow } from './Dots';
import { status, useThemedStyles, type Theme } from '../theme';

export interface RowProps {
  row: Row;
  onToggle(state: DayState): void;
  onOpen(): void;
  /** Timeline highlight for the current / next item. */
  focus?: 'Now' | 'Next' | null;
  /** Day being shown/edited (defaults to today). */
  date?: string;
  /** Show the habit's scheduled time in its meta line (plain lists, not the timeline). */
  showTime?: boolean;
  /** Smaller row without dots (Schedule tab). */
  compact?: boolean;
}

/** Check · name (+ a short meta line) · the last 7 days as small dots. Stats live in the grid and detail. */
export function HabitRow({ row, onToggle, onOpen, focus, date, showTime, compact }: RowProps) {
  const { idx, ctx } = useStore();
  const s = useThemedStyles(makeStyles);
  const h = row.habit;
  const day = date ?? ctx.today;
  const isToday = day === ctx.today;
  // Dots: the 7 days ending on the day shown. `today` = that day's state.
  const days = last7(day);
  const tl = timeline(h, idx, days[0], day, ctx);
  const dotStates = days.map((d) => tl.states.get(d) ?? 'none');
  const today = dotStates[6];
  const due = isToday ? dueLabel(h, idx, ctx) : null;
  const risk = isToday && missedTwiceRisk(h, idx, ctx);
  const dayFeeling = idx.get(h.id)?.get(day)?.feeling ?? null;
  const isNext =
    isToday && row.anchor != null && today === 'pending' && stateOn(row.anchor, idx, ctx.today, ctx) === 'done';

  const [scale] = useState(() => new Animated.Value(1));
  const prev = useRef(today);
  useEffect(() => {
    if (prev.current !== 'done' && today === 'done') {
      scale.setValue(0.7);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
    }
    prev.current = today;
  }, [today, scale]);

  const metaParts: React.ReactNode[] = [];
  if (focus)
    metaParts.push(
      <Text key="focus" style={s.next}>
        {focus}
      </Text>,
    );
  const nextStep = h.ladder[h.ladder_index];
  if (nextStep && today !== 'done')
    metaParts.push(
      <Text key="step" style={s.stepText} numberOfLines={1}>
        → {nextStep}
      </Text>,
    );
  if (h.pair_with && today !== 'done')
    metaParts.push(
      <Text key="pair" style={s.meta}>
        + {h.pair_with}
      </Text>,
    );
  if (showTime && h.scheduled_time)
    metaParts.push(
      <Text key="time" style={s.meta}>
        {formatTime(h.scheduled_time)}
      </Text>,
    );
  if (!isToday && today === 'missed')
    metaParts.push(
      <Text key="missed" style={s.meta}>
        missed · tap to mark done
      </Text>,
    );
  if (!isToday && dayFeeling != null)
    metaParts.push(
      <Text key="df" style={s.meta}>
        felt {FEELINGS[dayFeeling - 1]}
      </Text>,
    );
  if (isNext && !focus)
    metaParts.push(
      <Text key="next" style={s.next}>
        Next up
      </Text>,
    );
  if (risk)
    metaParts.push(
      <Text key="risk" style={s.risk}>
        ⚑ missed yesterday
      </Text>,
    );
  if (due)
    metaParts.push(
      <Text key="due" style={[s.meta, due.kind === 'overdue' && s.overdue, due.kind === 'due' && s.due]}>
        {due.text}
      </Text>,
    );
  if (today === 'skipped')
    metaParts.push(
      <Text key="skip" style={s.meta}>
        rest day
      </Text>,
    );

  return (
    <View
      style={[
        s.row,
        compact && s.rowCompact,
        { marginLeft: row.depth * (compact ? 16 : 22) },
        (isNext || focus) && s.rowNext,
        risk && s.rowRisk,
      ]}
    >
      {row.depth > 0 && !compact && <View style={s.stackLine} />}
      <Pressable
        onPress={() => onToggle(today)}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: today === 'done' }}
        accessibilityLabel={h.name}
      >
        <Animated.View style={[s.check, s[`check_${today}`], { transform: [{ scale }] }]}>
          {today === 'done' && <Text style={s.checkMark}>✓</Text>}
          {today === 'paused' && <Text style={[s.checkMark, { fontSize: 10 }]}>❙❙</Text>}
        </Animated.View>
      </Pressable>

      <Pressable style={s.body} onPress={onOpen}>
        <Text style={[s.name, today === 'done' && s.nameDone]} numberOfLines={1}>
          {h.name}
        </Text>
        {metaParts.length > 0 && <View style={s.metaRow}>{metaParts}</View>}
      </Pressable>

      {!compact && (
        <Pressable onPress={onOpen} style={s.right} hitSlop={6}>
          <DotRow states={dotStates} size={9} />
        </Pressable>
      )}
    </View>
  );
}

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 12,
      backgroundColor: t.surface,
      borderRadius: 12,
      marginBottom: 6,
      minHeight: 56,
    },
    rowNext: { backgroundColor: t.rowHighlight },
    rowCompact: { minHeight: 46, paddingVertical: 8, borderRadius: 10, marginBottom: 5 },
    rowRisk: { borderLeftWidth: 3, borderLeftColor: status.flag },
    stackLine: {
      position: 'absolute',
      left: -12,
      top: -6,
      height: 34,
      width: 10,
      borderLeftWidth: 1.5,
      borderBottomWidth: 1.5,
      borderColor: t.dotEmpty,
      borderBottomLeftRadius: 6,
    },
    check: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: t.dotEmpty,
      alignItems: 'center',
      justifyContent: 'center',
    },
    check_done: { backgroundColor: t.accent, borderColor: t.accent },
    check_skipped: { borderColor: status.skipped, borderStyle: 'dashed' },
    check_paused: { backgroundColor: status.paused, borderColor: status.paused },
    check_missed: {},
    check_pending: {},
    check_none: {},
    checkMark: { color: t.onAccent, fontSize: 16, fontWeight: '700', marginTop: -1 },
    body: { flex: 1, marginLeft: 12, justifyContent: 'center', minHeight: 34 },
    name: { fontSize: 16, color: t.text, fontWeight: '500' },
    nameDone: { color: t.textMuted },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    meta: { fontSize: 12, color: t.textMuted },
    due: { color: t.accent },
    overdue: { color: status.flag },
    next: { fontSize: 12, color: t.accent, fontWeight: '600' },
    risk: { fontSize: 12, color: status.flag, fontWeight: '600' },
    stepText: { fontSize: 12, color: t.text, fontWeight: '500', flexShrink: 1 },
    right: { alignItems: 'flex-end', marginLeft: 8 },
  });
