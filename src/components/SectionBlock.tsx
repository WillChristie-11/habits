import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type PanResponderInstance } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { DayState, Habit, Section } from '../types';
import { SECTION_LABELS } from '../types';
import { visibleOn, type Row } from '../lib/schedule';
import { useStore } from '../store';
import { HabitRow } from './HabitRow';
import { useThemedStyles, type Theme } from '../theme';

interface Props {
  section: Section;
  rows: Row[];
  editMode: boolean;
  setScrollEnabled(v: boolean): void;
  onToggle(h: Habit, state: DayState): void;
  onOpen(h: Habit): void;
  onLongPress(h: Habit): void;
  onDelete(h: Habit): void;
  /** Rendered between the header and rows (e.g. section banners). */
  header?: React.ReactNode;
  /** Day being shown (defaults to today). */
  date?: string;
}

/** A unit is a top-level habit plus everything stacked under it; they drag together. */
function toUnits(rows: Row[]): Row[][] {
  const units: Row[][] = [];
  for (const r of rows) {
    if (r.depth === 0 || units.length === 0) units.push([r]);
    else units[units.length - 1].push(r);
  }
  return units;
}

export function SectionBlock({
  section,
  rows,
  editMode,
  setScrollEnabled,
  onToggle,
  onOpen,
  onLongPress,
  onDelete,
  header,
  date,
}: Props) {
  const { idx, ctx, reorder } = useStore();
  const day = date ?? ctx.today;
  const styles = useThemedStyles(makeStyles);
  const units = useMemo(() => toUnits(rows), [rows]);

  // Measured unit heights (written from onLayout, read only inside gesture handlers).
  const heights = useRef<number[]>([]);
  const [dy] = useState(() => new Animated.Value(0));
  // Drag state for rendering; `h` is the dragged unit's height, snapshotted at grab time.
  const [drag, setDrag] = useState<{ from: number; to: number; h: number } | null>(null);
  const live = useRef<{ from: number; to: number } | null>(null);

  const responders: PanResponderInstance[] = useMemo(() => {
    const finish = () => {
      const d = live.current;
      live.current = null;
      dy.setValue(0);
      setDrag(null);
      setScrollEnabled(true);
      if (!d || d.from === d.to) return;
      const next = [...units];
      const [moved] = next.splice(d.from, 1);
      next.splice(d.to, 0, moved);
      reorder(next.flat().map((r) => r.habit.id));
    };
    // PanResponder only stores these callbacks; refs are read during gestures, not render.
    // eslint-disable-next-line react-hooks/refs
    return units.map((_, i) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          live.current = { from: i, to: i };
          setDrag({ from: i, to: i, h: heights.current[i] ?? 0 });
          setScrollEnabled(false);
          dy.setValue(0);
          Haptics.selectionAsync().catch(() => {});
        },
        onPanResponderMove: (_e, g) => {
          dy.setValue(g.dy);
          const hs = heights.current;
          const tops: number[] = [];
          hs.reduce((acc, h, j) => ((tops[j] = acc), acc + (h ?? 0)), 0);
          const center = tops[i] + (hs[i] ?? 0) / 2 + g.dy;
          let to = i;
          for (let j = 0; j < hs.length; j++) {
            const mid = tops[j] + (hs[j] ?? 0) / 2;
            if (j < i && center < mid) to = Math.min(to, j);
            if (j > i && center > mid) to = Math.max(to, j);
          }
          if (live.current && live.current.to !== to) {
            live.current = { from: i, to };
            setDrag({ from: i, to, h: hs[i] ?? 0 });
            Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderRelease: finish,
        onPanResponderTerminate: finish,
      }),
    );
  }, [units, dy, reorder, setScrollEnabled]);

  if (units.length === 0 && !editMode) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{SECTION_LABELS[section]}</Text>
      {header}
      {units.length === 0 && <Text style={styles.empty}>No habits here yet.</Text>}
      {units.map((unit, i) => {
        let shift = 0;
        if (drag && i !== drag.from) {
          if (drag.from < i && i <= drag.to) shift = -drag.h;
          else if (drag.to <= i && i < drag.from) shift = drag.h;
        }
        const dragging = drag?.from === i;
        return (
          <Animated.View
            key={unit[0].habit.id}
            onLayout={(e) => (heights.current[i] = e.nativeEvent.layout.height)}
            style={[
              dragging
                ? { transform: [{ translateY: dy }], zIndex: 10, ...styles.lifted }
                : { transform: [{ translateY: shift }] },
            ]}
          >
            {unit.map((row) => (
              <HabitRow
                key={row.habit.id}
                row={row}
                editMode={editMode}
                date={day}
                showTime
                dimmed={editMode && !visibleOn(row.habit, idx, ctx, day)}
                dragHandlers={row.depth === 0 ? responders[i]?.panHandlers : undefined}
                onToggle={(s) => onToggle(row.habit, s)}
                onOpen={() => onOpen(row.habit)}
                onLongPress={() => onLongPress(row.habit)}
                onDelete={() => onDelete(row.habit)}
              />
            ))}
          </Animated.View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
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
  empty: { color: t.textMuted, fontSize: 14, marginLeft: 4, marginBottom: 8 },
  lifted: {
    shadowColor: t.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
