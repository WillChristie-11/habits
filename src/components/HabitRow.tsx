import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import type { DayState } from '../types';
import { FEELINGS } from '../types';
import { useStore } from '../store';
import {
  dueLabel,
  feelingLabel,
  feelingStats,
  missedTwiceRisk,
  progress,
  stateOn,
  timeline,
  type Row,
} from '../lib/schedule';
import { formatTime, last7, weekDays } from '../lib/dates';
import { DotRow } from './Dots';
import { status, useThemedStyles, type Theme } from '../theme';

export interface RowProps {
  row: Row;
  editMode: boolean;
  onToggle(state: DayState): void;
  onOpen(): void;
  onLongPress(): void;
  onDelete(): void;
  dragHandlers?: GestureResponderHandlers;
  dimmed?: boolean;
  /** Timeline highlight for the current / next item. */
  focus?: 'Now' | 'Next' | null;
  /** Day being shown/edited (defaults to today). */
  date?: string;
  /** Show the habit's scheduled time in its meta line (plain lists, not the timeline). */
  showTime?: boolean;
  /** Smaller row without dots or % (Schedule tab). */
  compact?: boolean;
}

export function HabitRow({
  row,
  editMode,
  onToggle,
  onOpen,
  onLongPress,
  onDelete,
  dragHandlers,
  dimmed,
  focus,
  date,
  showTime,
  compact,
}: RowProps) {
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
  const week = progress(h, idx, weekDays(day), ctx);
  const due = isToday ? dueLabel(h, idx, ctx) : null;
  const risk = isToday && missedTwiceRisk(h, idx, ctx);
  const feel = feelingStats(h, idx);
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
  if (focus) metaParts.push(<Text key="focus" style={s.next}>{focus}</Text>);
  const nextStep = h.ladder[h.ladder_index];
  if (nextStep && today !== 'done') metaParts.push(<Text key="step" style={s.stepText} numberOfLines={1}>→ {nextStep}</Text>);
  if (h.pair_with && today !== 'done') metaParts.push(<Text key="pair" style={s.meta}>+ {h.pair_with}</Text>);
  if (showTime && h.scheduled_time) metaParts.push(<Text key="time" style={s.meta}>{formatTime(h.scheduled_time)}</Text>);
  if (!isToday && today === 'missed') metaParts.push(<Text key="missed" style={s.meta}>missed · tap to mark done</Text>);
  if (!isToday && dayFeeling != null) metaParts.push(<Text key="df" style={s.meta}>felt {FEELINGS[dayFeeling - 1]}</Text>);
  if (isNext && !focus) metaParts.push(<Text key="next" style={s.next}>Next up</Text>);
  if (risk) metaParts.push(<Text key="risk" style={s.risk}>⚑ missed yesterday</Text>);
  if (due)
    metaParts.push(
      <Text key="due" style={[s.meta, due.kind === 'overdue' && s.overdue, due.kind === 'due' && s.due]}>
        {due.text}
      </Text>,
    );
  if (today === 'skipped') metaParts.push(<Text key="skip" style={s.meta}>rest day</Text>);
  if (isToday && feel.count >= 10 && feel.avg != null)
    metaParts.push(
      <Text key="feel" style={s.meta}>
        usually {feelingLabel(feel.avg)} after this
      </Text>,
    );
  if (editMode && dimmed) metaParts.push(<Text key="nt" style={s.meta}>{isToday ? 'not today' : 'not due this day'}</Text>);

  const avoid = h.habit_kind === 'avoid';
  // Avoid habits never show counts or %.
  const weekText = avoid
    ? ''
    : week.target != null ? `${week.done}/${week.target}` : week.pct == null ? '—' : `${Math.round(week.pct * 100)}%`;

  return (
    <View
      style={[
        s.row,
        compact && s.rowCompact,
        { marginLeft: row.depth * (compact ? 16 : 22) },
        (isNext || focus) && s.rowNext,
        risk && s.rowRisk,
        dimmed && { opacity: 0.55 },
      ]}
    >
      {row.depth > 0 && !compact && <View style={s.stackLine} />}
      <Leading editMode={editMode} dragHandlers={dragHandlers}>
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
      </Leading>

      <Pressable
        style={s.body}
        onPress={editMode ? undefined : onOpen}
        onLongPress={editMode ? undefined : onLongPress}
        delayLongPress={350}
      >
        <Text style={[s.name, today === 'done' && s.nameDone]} numberOfLines={1}>
          {h.name}
        </Text>
        {metaParts.length > 0 && <View style={s.metaRow}>{metaParts}</View>}
      </Pressable>

      {editMode ? (
        <DeleteButton onDelete={onDelete} />
      ) : compact ? null : (
        <Pressable onPress={onOpen} style={s.right}>
          <DotRow states={dotStates} />
          {!!weekText && <Text style={s.pct}>{weekText}</Text>}
        </Pressable>
      )}
    </View>
  );
}

/** Drag handle in edit mode (or a spacer for rows that can't be dragged on their own), else children. */
export function Leading({
  editMode,
  dragHandlers,
  children,
}: {
  editMode: boolean;
  dragHandlers?: GestureResponderHandlers;
  children: React.ReactNode;
}) {
  const s = useThemedStyles(makeStyles);
  if (!editMode) return <>{children}</>;
  if (!dragHandlers) return <View style={s.handle} />;
  return (
    <View {...dragHandlers} style={s.handle} hitSlop={8} accessibilityLabel="Drag to reorder">
      <Text style={s.handleText}>≡</Text>
    </View>
  );
}

/** ✕, then a "Remove?" confirm that times out after 4 s. */
export function DeleteButton({ onDelete }: { onDelete(): void }) {
  const s = useThemedStyles(makeStyles);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  return confirm ? (
    <Pressable onPress={onDelete} style={s.removeBtn} accessibilityRole="button">
      <Text style={s.removeText}>Remove?</Text>
    </Pressable>
  ) : (
    <Pressable onPress={() => setConfirm(true)} hitSlop={10} style={s.x} accessibilityLabel="Delete">
      <Text style={s.xText}>✕</Text>
    </Pressable>
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
    rowNext: { backgroundColor: t.accentSoft },
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
    handle: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
    handleText: { fontSize: 22, color: t.textMuted },
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
    pct: { fontSize: 11, color: t.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },
    x: { padding: 6 },
    xText: { fontSize: 16, color: t.textMuted },
    removeBtn: { backgroundColor: status.deadline, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    removeText: { color: status.onStatus, fontWeight: '600', fontSize: 13 },
  });
