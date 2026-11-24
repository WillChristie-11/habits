import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DayState, Habit } from '../types';
import type { Row } from '../lib/schedule';
import { useStore } from '../store';
import { HabitRow } from './HabitRow';
import { ReorderList } from './ReorderList';
import { SwipeRow, type SwipeAction } from './SwipeRow';
import { useThemedStyles, type Theme } from '../theme';

interface Props {
  /** A small caps title ("Anytime", "This week"), or a custom header such as an anchor row. */
  title?: string;
  head?: React.ReactNode;
  rows: Row[];
  setScrollEnabled(v: boolean): void;
  onToggle(h: Habit, state: DayState): void;
  onOpen(h: Habit): void;
  onDelete(h: Habit): void;
  swipeActions(h: Habit): SwipeAction[];
  /** Day being shown (defaults to today). */
  date?: string;
  /** Rows sit tighter under an anchor header. */
  nested?: boolean;
  /** Show each row's time (off for Anytime, where items have none). */
  showTime?: boolean;
}

/** A group on Today: header, then rows you can swipe (Edit / Skip, Delete) and long-press to drag. */
export function SectionBlock({
  title,
  head,
  rows,
  setScrollEnabled,
  onToggle,
  onOpen,
  onDelete,
  swipeActions,
  date,
  nested,
  showTime = true,
}: Props) {
  const { ctx } = useStore();
  const day = date ?? ctx.today;
  const s = useThemedStyles(makeStyles);
  if (!head && rows.length === 0) return null;

  return (
    <View style={head ? s.anchorSection : s.section}>
      {title && <Text style={s.title}>{title}</Text>}
      {head}
      <View style={nested ? s.nested : undefined}>
        <ReorderList
          rows={rows}
          setScrollEnabled={setScrollEnabled}
          renderRow={(row) => (
            <SwipeRow
              key={row.habit.id}
              name={row.habit.name}
              onDelete={() => onDelete(row.habit)}
              actions={swipeActions(row.habit)}
            >
              <HabitRow
                row={row}
                date={day}
                showTime={showTime}
                onToggle={(st) => onToggle(row.habit, st)}
                onOpen={() => onOpen(row.habit)}
              />
            </SwipeRow>
          )}
        />
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    section: { marginTop: 22 },
    anchorSection: { marginTop: 14 },
    nested: { marginLeft: 14 },
    title: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textMuted,
      marginBottom: 8,
      marginLeft: 4,
    },
  });
