import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DayState, Habit } from '../types';
import { useStore } from '../store';
import { fromMinutes, stateOn, timelineFocus, toMinutes, type Row } from '../lib/schedule';
import { useThemedStyles, type Theme } from '../theme';
import { AnchorRow } from './AnchorRow';
import { HabitRow } from './HabitRow';
import { formatTime } from './TimeField';

interface Props {
  rows: Row[];
  editMode: boolean;
  onToggle(h: Habit, state: DayState): void;
  onOpen(h: Habit): void;
  onLongPress(h: Habit): void;
  onDelete(h: Habit): void;
}

/** Anchors and scheduled habits at their times, with stacked habits under them, plus a "now" line. */
export function TimelineBlock({ rows, editMode, onToggle, onOpen, onLongPress, onDelete }: Props) {
  const { idx, ctx, now } = useStore();
  const s = useThemedStyles(makeStyles);
  if (rows.length === 0) return null;

  const stateOf = (h: Habit) => stateOn(h, idx, ctx.today, ctx);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const focus = editMode ? null : timelineFocus(rows, stateOf, nowMin);

  // Group into blocks: a root plus its stacked rows.
  const blocks: Row[][] = [];
  for (const r of rows) {
    if (r.depth === 0 || blocks.length === 0) blocks.push([r]);
    else blocks[blocks.length - 1].push(r);
  }
  let nowIndex = blocks.findIndex((b) => toMinutes(b[0].habit.scheduled_time ?? '00:00') > nowMin);
  if (nowIndex === -1) nowIndex = blocks.length;

  const nowLine = (
    <View key="now" style={s.nowRow} accessibilityLabel={`Now, ${formatTime(fromMinutes(nowMin))}`}>
      <Text style={s.nowTime}>{formatTime(fromMinutes(nowMin))}</Text>
      <View style={s.nowDot} />
      <View style={s.nowLine} />
    </View>
  );

  const out: React.ReactNode[] = [];
  blocks.forEach((block, i) => {
    if (i === nowIndex && !editMode) out.push(nowLine);
    const root = block[0].habit;
    out.push(
      <View key={root.id} style={s.block}>
        <Text style={s.time}>{formatTime(root.scheduled_time)}</Text>
        <View style={{ flex: 1 }}>
          {block.map((r) => {
            const f = focus?.id === r.habit.id ? focus.label : null;
            return r.habit.kind === 'anchor' ? (
              <AnchorRow
                key={r.habit.id}
                anchor={r.habit}
                state={stateOf(r.habit)}
                editMode={editMode}
                focus={f}
                onToggle={() => onToggle(r.habit, stateOf(r.habit))}
                onOpen={() => onOpen(r.habit)}
                onDelete={() => onDelete(r.habit)}
              />
            ) : (
              <HabitRow
                key={r.habit.id}
                row={r}
                editMode={editMode}
                focus={f}
                onToggle={(st) => onToggle(r.habit, st)}
                onOpen={() => onOpen(r.habit)}
                onLongPress={() => onLongPress(r.habit)}
                onDelete={() => onDelete(r.habit)}
              />
            );
          })}
        </View>
      </View>,
    );
  });
  if (nowIndex === blocks.length && !editMode) out.push(nowLine);

  return (
    <View style={s.section}>
      <Text style={s.title}>Schedule</Text>
      {out}
    </View>
  );
}

const TIME_W = 64;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    section: { marginTop: 22 },
    title: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginLeft: 4,
    },
    block: { flexDirection: 'row' },
    time: {
      width: TIME_W,
      paddingTop: 15,
      fontSize: 12,
      color: t.textMuted,
      fontVariant: ['tabular-nums'],
    },
    nowRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
    nowTime: { width: TIME_W - 6, fontSize: 11, fontWeight: '700', color: t.accent, fontVariant: ['tabular-nums'] },
    nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent },
    nowLine: { flex: 1, height: 1.5, backgroundColor: t.accent, opacity: 0.6 },
  });
