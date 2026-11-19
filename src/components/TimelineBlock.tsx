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
  | { kind: 'anchor' | 'timed'; minutes: number; rows: Row[] }
  | { kind: 'flex'; key: string; minutes: number; label: string; rows: Row[] };

/**
 * The day on a vertical rail. Anchors are the key activities (large node, prominent card);
 * timed habits are small nodes; habits without a time sit as compact rows under a quiet
 * "anytime" label at the start of their window (Morning at the morning reminder time,
 * Evening when the evening nudge starts, This week at the end).
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
      entries.push({
        kind: row.habit.kind === 'anchor' ? 'anchor' : 'timed',
        minutes: toMinutes(row.habit.scheduled_time ?? '00:00'),
        rows: [row],
      });
    } else entries[entries.length - 1].rows.push(row);
  }
  const flex = (key: string, minutes: number, label: string, rows: Row[]) =>
    rows.length && entries.push({ kind: 'flex', key, minutes, label, rows });
  flex('morning', toMinutes(r.morningTime), `Anytime this morning · before ${formatTime(MORNING_ENDS)}`, layout.sections.morning);
  flex('evening', toMinutes(nudgeStart(r)), `Anytime this evening · before ${formatTime(r.eveningDeadline)}`, layout.sections.evening);
  flex('week', 24 * 60, 'Any day this week', layout.sections.week);
  entries.sort((a, b) => a.minutes - b.minutes || (a.kind === 'flex' ? 1 : b.kind === 'flex' ? -1 : 0));

  if (!entries.length) return null;

  let nowIndex = entries.findIndex((e) => e.minutes > nowMin);
  if (nowIndex === -1) nowIndex = entries.length;

  const habitRow = (row: Row) => (
    <HabitRow
      key={row.habit.id}
      row={{ ...row, depth: Math.max(0, row.depth - (row.anchor?.kind === 'anchor' ? 1 : 0)) }}
      compact
      editMode={editMode}
      focus={focus?.id === row.habit.id ? focus.label : null}
      onToggle={(st) => onToggle(row.habit, st)}
      onOpen={() => onOpen(row.habit)}
      onLongPress={() => onLongPress(row.habit)}
      onDelete={() => onDelete(row.habit)}
    />
  );

  const out: React.ReactNode[] = [];
  entries.forEach((e, i) => {
    if (i === nowIndex && !editMode) {
      out.push(
        <View key="now" style={s.entry} accessibilityLabel={`Now, ${formatTime(fromMinutes(nowMin))}`}>
          <Text style={[s.time, s.nowTime]} numberOfLines={1}>{formatTime(fromMinutes(nowMin))}</Text>
          <View style={s.rail}>
            <View style={s.line} />
            <View style={[s.node, s.nowNode]} />
          </View>
          <View style={s.nowLineWrap}>
            <View style={s.nowLine} />
          </View>
        </View>,
      );
    }
    const first = e.rows[0].habit;
    const isFocus = focus?.id === first.id;
    const passed = e.kind !== 'flex' && !isFocus && e.minutes < nowMin && e.rows.every((x) => stateOf(x.habit) !== 'pending');

    if (e.kind === 'anchor') {
      const done = ['done', 'skipped'].includes(stateOf(first));
      out.push(
        <View key={`a-${first.id}`} style={[s.entry, passed && s.passed]}>
          <Text style={[s.time, s.anchorTime, isFocus && s.focusTime]}>{formatTime(first.scheduled_time)}</Text>
          <View style={s.rail}>
            <View style={s.line} />
            <View style={[s.node, s.anchorNode, (isFocus || done) && s.anchorNodeOn]} />
          </View>
          <View style={s.content}>
            <AnchorRow
              anchor={first}
              state={stateOf(first)}
              editMode={editMode}
              focus={isFocus ? focus!.label : null}
              onToggle={() => onToggle(first, stateOf(first))}
              onOpen={() => onOpen(first)}
              onDelete={() => onDelete(first)}
            />
            {e.rows.slice(1).map(habitRow)}
          </View>
        </View>,
      );
    } else if (e.kind === 'timed') {
      out.push(
        <View key={`t-${first.id}`} style={[s.entry, passed && s.passed]}>
          <Text style={[s.time, isFocus && s.focusTime]}>{formatTime(first.scheduled_time)}</Text>
          <View style={s.rail}>
            <View style={s.line} />
            <View style={[s.node, s.smallNode, isFocus && s.anchorNodeOn]} />
          </View>
          <View style={s.content}>{e.rows.map(habitRow)}</View>
        </View>,
      );
    } else if (e.kind === 'flex') {
      out.push(
        <View key={`f-${e.key}`} style={s.entry}>
          <Text style={s.time}>{e.key === 'week' ? '' : formatTime(fromMinutes(e.minutes))}</Text>
          <View style={s.rail}>
            <View style={s.line} />
            <View style={[s.node, s.flexNode]} />
          </View>
          <View style={s.content}>
            <Text style={s.flexLabel}>{e.label}</Text>
            {e.rows.map(habitRow)}
          </View>
        </View>,
      );
    }
  });
  if (nowIndex === entries.length && !editMode) {
    out.push(
      <View key="now" style={s.entry}>
        <Text style={[s.time, s.nowTime]} numberOfLines={1}>{formatTime(fromMinutes(nowMin))}</Text>
        <View style={s.rail}>
          <View style={[s.node, s.nowNode]} />
        </View>
        <View style={s.nowLineWrap}>
          <View style={s.nowLine} />
        </View>
      </View>,
    );
  }

  return <View>{out}</View>;
}

const TIME_W = 66;
const RAIL_W = 22;
const NODE_TOP = 22;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    entry: { flexDirection: 'row' },
    passed: { opacity: 0.6 },
    time: {
      width: TIME_W,
      paddingTop: NODE_TOP - 7,
      fontSize: 12,
      color: t.textMuted,
      textAlign: 'right',
      paddingRight: 6,
      fontVariant: ['tabular-nums'],
    },
    anchorTime: { fontWeight: '700', color: t.text },
    focusTime: { color: t.accent, fontWeight: '700' },
    nowTime: { color: t.accent, fontWeight: '700', paddingTop: 2, fontSize: 11 },
    rail: { width: RAIL_W, alignItems: 'center' },
    line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.border },
    node: { position: 'absolute', borderRadius: 10 },
    anchorNode: {
      top: NODE_TOP - 7,
      width: 14,
      height: 14,
      borderWidth: 2.5,
      borderColor: t.accent,
      backgroundColor: t.background,
    },
    anchorNodeOn: { backgroundColor: t.accent, borderColor: t.accent },
    smallNode: {
      top: NODE_TOP - 4,
      width: 8,
      height: 8,
      borderWidth: 2,
      borderColor: t.dotEmpty,
      backgroundColor: t.background,
    },
    flexNode: { top: 6, width: 6, height: 6, backgroundColor: t.dotEmpty },
    nowNode: { top: 4, width: 10, height: 10, backgroundColor: t.accent },
    content: { flex: 1, paddingLeft: 8, paddingBottom: 10 },
    flexLabel: { fontSize: 12, color: t.textMuted, fontWeight: '600', marginBottom: 6, marginTop: 1 },
    nowLineWrap: { flex: 1, justifyContent: 'flex-start', paddingTop: 8, paddingLeft: 4, height: 22 },
    nowLine: { height: 2, backgroundColor: t.accent, borderRadius: 1, opacity: 0.7 },
  });
