import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import type { DayState } from '../types';
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
import { last7, weekDays } from '../lib/dates';
import { DotRow } from './Dots';
import { colors } from '../theme';

interface Props {
  row: Row;
  editMode: boolean;
  onToggle(state: DayState): void;
  onOpen(): void;
  onLongPress(): void;
  onDelete(): void;
  dragHandlers?: GestureResponderHandlers;
  dimmed?: boolean;
}

export function HabitRow({ row, editMode, onToggle, onOpen, onLongPress, onDelete, dragHandlers, dimmed }: Props) {
  const { idx, ctx } = useStore();
  const h = row.habit;
  const days = last7(ctx.today);
  const tl = timeline(h, idx, days[0], ctx.today, ctx);
  const dotStates = days.map((d) => tl.states.get(d) ?? 'none');
  const today = dotStates[6];
  const week = progress(h, idx, weekDays(ctx.today), ctx);
  const due = dueLabel(h, idx, ctx);
  const risk = missedTwiceRisk(h, idx, ctx);
  const feel = feelingStats(h, idx);
  const isNext =
    row.anchor != null && today === 'pending' && stateOn(row.anchor, idx, ctx.today, ctx) === 'done';

  const [scale] = useState(() => new Animated.Value(1));
  const prev = useRef(today);
  useEffect(() => {
    if (prev.current !== 'done' && today === 'done') {
      scale.setValue(0.7);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
    }
    prev.current = today;
  }, [today, scale]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  const showConfirm = confirmDelete && editMode;

  const metaParts: React.ReactNode[] = [];
  if (isNext) metaParts.push(<Text key="next" style={styles.next}>Next up</Text>);
  if (risk) metaParts.push(<Text key="risk" style={styles.risk}>⚑ missed yesterday</Text>);
  if (due)
    metaParts.push(
      <Text
        key="due"
        style={[styles.meta, due.kind === 'overdue' && { color: colors.amber }, due.kind === 'due' && { color: colors.accent }]}
      >
        {due.text}
      </Text>,
    );
  if (today === 'skipped') metaParts.push(<Text key="skip" style={[styles.meta, { color: colors.skip }]}>rest day</Text>);
  if (feel.count >= 10 && feel.avg != null)
    metaParts.push(
      <Text key="feel" style={styles.meta}>
        usually {feelingLabel(feel.avg)} after this
      </Text>,
    );
  if (editMode && dimmed) metaParts.push(<Text key="nt" style={styles.meta}>not today</Text>);

  const weekText =
    week.target != null ? `${week.done}/${week.target}` : week.pct == null ? '—' : `${Math.round(week.pct * 100)}%`;

  return (
    <View
      style={[
        styles.row,
        { marginLeft: row.depth * 22 },
        isNext && styles.rowNext,
        risk && styles.rowRisk,
        dimmed && { opacity: 0.55 },
      ]}
    >
      {row.depth > 0 && <View style={styles.stackLine} />}
      {editMode ? (
        dragHandlers ? (
          <View {...dragHandlers} style={styles.handle} hitSlop={8} accessibilityLabel="Drag to reorder">
            <Text style={styles.handleText}>≡</Text>
          </View>
        ) : (
          // Stacked habits move with their anchor.
          <View style={styles.handle} />
        )
      ) : (
        <Pressable
          onPress={() => onToggle(today)}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: today === 'done' }}
          accessibilityLabel={h.name}
        >
          <Animated.View style={[styles.check, checkStyle(today), { transform: [{ scale }] }]}>
            {today === 'done' && <Text style={styles.checkMark}>✓</Text>}
            {today === 'skipped' && <Text style={[styles.checkMark, { color: colors.skip }]}>–</Text>}
            {today === 'paused' && <Text style={[styles.checkMark, { color: '#fff', fontSize: 11 }]}>❙❙</Text>}
          </Animated.View>
        </Pressable>
      )}

      <Pressable
        style={styles.body}
        onPress={editMode ? undefined : onOpen}
        onLongPress={editMode ? undefined : onLongPress}
        delayLongPress={350}
      >
        <Text style={[styles.name, today === 'done' && styles.nameDone]} numberOfLines={1}>
          {h.name}
        </Text>
        {metaParts.length > 0 && <View style={styles.metaRow}>{metaParts}</View>}
      </Pressable>

      {editMode ? (
        showConfirm ? (
          <Pressable onPress={onDelete} style={styles.removeBtn} accessibilityRole="button">
            <Text style={styles.removeText}>Remove?</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setConfirmDelete(true)} hitSlop={10} style={styles.x} accessibilityLabel="Delete">
            <Text style={styles.xText}>✕</Text>
          </Pressable>
        )
      ) : (
        <Pressable onPress={onOpen} style={styles.right}>
          <DotRow states={dotStates} />
          <Text style={styles.pct}>{weekText}</Text>
        </Pressable>
      )}
    </View>
  );
}

function checkStyle(s: DayState) {
  switch (s) {
    case 'done':
      return { backgroundColor: colors.accent, borderColor: colors.accent };
    case 'skipped':
      return { borderColor: colors.skip };
    case 'paused':
      return { backgroundColor: colors.paused, borderColor: colors.paused };
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 6,
    minHeight: 56,
  },
  rowNext: { backgroundColor: colors.accentSoft },
  rowRisk: { borderLeftWidth: 3, borderLeftColor: colors.amber },
  stackLine: {
    position: 'absolute',
    left: -12,
    top: -6,
    height: 34,
    width: 10,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.faint,
    borderBottomLeftRadius: 6,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: -1 },
  handle: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  handleText: { fontSize: 22, color: colors.sub },
  body: { flex: 1, marginLeft: 12, justifyContent: 'center', minHeight: 34 },
  name: { fontSize: 16, color: colors.text, fontWeight: '500' },
  nameDone: { color: colors.sub },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  meta: { fontSize: 12, color: colors.sub },
  next: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  risk: { fontSize: 12, color: colors.amber, fontWeight: '600' },
  right: { alignItems: 'flex-end', marginLeft: 8 },
  pct: { fontSize: 11, color: colors.sub, marginTop: 3, fontVariant: ['tabular-nums'] },
  x: { padding: 6 },
  xText: { fontSize: 16, color: colors.sub },
  removeBtn: { backgroundColor: colors.red, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  removeText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
