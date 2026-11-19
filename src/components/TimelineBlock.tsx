import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DayState, Habit } from '../types';
import { useStore } from '../store';
import { fromMinutes, stateOn, timelineFocus, toMinutes, type DayLayout, type Row } from '../lib/schedule';
import { nudgeStart, MORNING_ENDS } from '../lib/reminders';
import { formatTime } from '../lib/dates';
import { useThemedStyles, type Theme } from '../theme';
import { AnchorRow } from './AnchorRow';
import { HabitRow } from './HabitRow';

interface Props {
  layout: DayLayout;
  editMode: boolean;
  onToggle(h: Habit, state: DayState): void;
  onOpen(h: Habit): void;
  onLongPress(h: Habit): void;
  onDelete(h: Habit): void;
}

type Entry =
  | { kind: 'fixed'; minutes: number; rows: Row[] }
  | { kind: 'flex'; key: string; minutes: number; timeLabel: string; title: string; subtitle: string; rows: Row[] };

/**
 * The day as a timeline. Anchors and timed habits sit at their times (stacked habits under
 * them); habits without a time stay flexible, grouped at the start of their window:
 * Morning at the morning reminder time, Evening when the evening nudge starts, This week last.
 */
export function TimelineBlock({ layout, editMode, onToggle, onOpen, onLongPress, onDelete }: Props) {
  const { idx, ctx, now, settings } = useStore();
  const s = useThemedStyles(makeStyles);
  const r = settings.reminders;

  const stateOf = (h: Habit) => stateOn(h, idx, ctx.today, ctx);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const focus = editMode ? null : timelineFocus(layout.timeline, stateOf, nowMin);

  const entries: Entry[] = [];
  for (const row of layout.timeline) {
    if (row.depth === 0 || entries.length === 0) {
      entries.push({ kind: 'fixed', minutes: toMinutes(row.habit.scheduled_time ?? '00:00'), rows: [row] });
    } else entries[entries.length - 1].rows.push(row);
  }
  const flex = (key: string, minutes: number, timeLabel: string, title: string, subtitle: string, rows: Row[]) =>
    rows.length && entries.push({ kind: 'flex', key, minutes, timeLabel, title, subtitle, rows });
  flex('morning', toMinutes(r.morningTime), formatTime(r.morningTime), 'Morning', `Flexible · any time before ${formatTime(MORNING_ENDS)}`, layout.sections.morning);
  flex('evening', toMinutes(nudgeStart(r)), formatTime(nudgeStart(r)), 'Evening', `Flexible · before ${formatTime(r.eveningDeadline)}`, layout.sections.evening);
  flex('week', 24 * 60, 'Week', 'This week', 'Flexible · any day', layout.sections.week);
  entries.sort((a, b) => a.minutes - b.minutes || (a.kind === 'fixed' ? -1 : 1));

  if (!entries.length) return null;

  let nowIndex = entries.findIndex((e) => e.minutes > nowMin);
  if (nowIndex === -1) nowIndex = entries.length;
  const nowLine = (
    <View key="now" style={s.nowRow} accessibilityLabel={`Now, ${formatTime(fromMinutes(nowMin))}`}>
      <Text style={s.nowTime}>{formatTime(fromMinutes(nowMin))}</Text>
      <View style={s.nowDot} />
      <View style={s.nowLine} />
    </View>
  );

  const renderRow = (row: Row) => {
    const f = focus?.id === row.habit.id ? focus.label : null;
    return row.habit.kind === 'anchor' ? (
      <AnchorRow
        key={row.habit.id}
        anchor={row.habit}
        state={stateOf(row.habit)}
        editMode={editMode}
        focus={f}
        onToggle={() => onToggle(row.habit, stateOf(row.habit))}
        onOpen={() => onOpen(row.habit)}
        onDelete={() => onDelete(row.habit)}
      />
    ) : (
      <HabitRow
        key={row.habit.id}
        row={row}
        editMode={editMode}
        focus={f}
        onToggle={(st) => onToggle(row.habit, st)}
        onOpen={() => onOpen(row.habit)}
        onLongPress={() => onLongPress(row.habit)}
        onDelete={() => onDelete(row.habit)}
      />
    );
  };

  const out: React.ReactNode[] = [];
  entries.forEach((e, i) => {
    if (i === nowIndex && !editMode) out.push(nowLine);
    if (e.kind === 'fixed') {
      out.push(
        <View key={`fixed-${e.rows[0].habit.id}`} style={s.block}>
          <Text style={s.time}>{formatTime(e.rows[0].habit.scheduled_time)}</Text>
          <View style={{ flex: 1 }}>{e.rows.map(renderRow)}</View>
        </View>,
      );
    } else {
      out.push(
        <View key={`flex-${e.key}`} style={s.block}>
          <Text style={s.time}>{e.timeLabel}</Text>
          <View style={[s.flexBox, { flex: 1 }]}>
            <Text style={s.flexTitle}>{e.title}</Text>
            <Text style={s.flexSub}>{e.subtitle}</Text>
            <View style={{ marginTop: 8 }}>{e.rows.map(renderRow)}</View>
          </View>
        </View>,
      );
    }
  });
  if (nowIndex === entries.length && !editMode) out.push(nowLine);

  return <View>{out}</View>;
}

const TIME_W = 64;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    block: { flexDirection: 'row', marginBottom: 2 },
    time: { width: TIME_W, paddingTop: 15, fontSize: 12, color: t.textMuted, fontVariant: ['tabular-nums'] },
    flexBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.dotEmpty,
      padding: 8,
      paddingTop: 10,
      marginBottom: 6,
    },
    flexTitle: { fontSize: 13, fontWeight: '700', color: t.text, marginLeft: 4 },
    flexSub: { fontSize: 12, color: t.textMuted, marginLeft: 4, marginTop: 1 },
    nowRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
    nowTime: { width: TIME_W - 6, fontSize: 11, fontWeight: '700', color: t.accent, fontVariant: ['tabular-nums'] },
    nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent },
    nowLine: { flex: 1, height: 1.5, backgroundColor: t.accent, opacity: 0.6 },
  });
