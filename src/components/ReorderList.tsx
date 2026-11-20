import React, { useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { Row } from '../lib/schedule';
import { useStore } from '../store';
import { useThemedStyles, type Theme } from '../theme';

/** A unit is a top-level row plus everything stacked under it; they move together. */
function toUnits(rows: Row[]): Row[][] {
  const units: Row[][] = [];
  for (const r of rows) {
    if (r.depth === 0 || units.length === 0) units.push([r]);
    else units[units.length - 1].push(r);
  }
  return units;
}

interface Props {
  rows: Row[];
  renderRow(row: Row): React.ReactNode;
  setScrollEnabled(v: boolean): void;
}

/** Long-press a row, then drag to reorder it within its group. */
export function ReorderList({ rows, renderRow, setScrollEnabled }: Props) {
  const { reorder } = useStore();
  const s = useThemedStyles(makeStyles);
  const units = useMemo(() => toUnits(rows), [rows]);
  const heights = useRef<number[]>([]);
  const [dy] = useState(() => new Animated.Value(0));
  const [drag, setDrag] = useState<{ from: number; to: number; h: number } | null>(null);
  const live = useRef<{ from: number; to: number } | null>(null);

  const begin = (i: number) => {
    live.current = { from: i, to: i };
    dy.setValue(0);
    setDrag({ from: i, to: i, h: heights.current[i] ?? 0 });
    setScrollEnabled(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };
  const move = (i: number, ty: number) => {
    dy.setValue(ty);
    const hs = heights.current;
    const tops: number[] = [];
    hs.reduce((acc, h, j) => ((tops[j] = acc), acc + (h ?? 0)), 0);
    const center = tops[i] + (hs[i] ?? 0) / 2 + ty;
    let to = i;
    for (let j = 0; j < units.length; j++) {
      const mid = tops[j] + (hs[j] ?? 0) / 2;
      if (j < i && center < mid) to = Math.min(to, j);
      if (j > i && center > mid) to = Math.max(to, j);
    }
    if (live.current && live.current.to !== to) {
      live.current = { from: i, to };
      setDrag({ from: i, to, h: hs[i] ?? 0 });
      Haptics.selectionAsync().catch(() => {});
    }
  };
  const end = () => {
    const d = live.current;
    if (!d) return; // finalized without ever activating (a tap or a scroll)
    live.current = null;
    dy.setValue(0);
    setDrag(null);
    setScrollEnabled(true);
    if (d.from === d.to) return;
    const next = [...units];
    const [moved] = next.splice(d.from, 1);
    next.splice(d.to, 0, moved);
    reorder(next.flat().map((r) => r.habit.id));
  };

  return (
    <>
      {units.map((unit, i) => {
        let shift = 0;
        if (drag && i !== drag.from) {
          if (drag.from < i && i <= drag.to) shift = -drag.h;
          else if (drag.to <= i && i < drag.from) shift = drag.h;
        }
        const dragging = drag?.from === i;
        return (
          <DragUnit
            key={unit[0].habit.id}
            enabled={units.length > 1}
            onBegin={() => begin(i)}
            onMove={(ty) => move(i, ty)}
            onEnd={end}
            onLayout={(h) => (heights.current[i] = h)}
            style={
              dragging
                ? [{ transform: [{ translateY: dy }], zIndex: 10 }, s.lifted]
                : { transform: [{ translateY: shift }] }
            }
          >
            {unit.map(renderRow)}
          </DragUnit>
        );
      })}
    </>
  );
}

function DragUnit({
  enabled,
  onBegin,
  onMove,
  onEnd,
  onLayout,
  style,
  children,
}: {
  enabled: boolean;
  onBegin(): void;
  onMove(ty: number): void;
  onEnd(): void;
  onLayout(h: number): void;
  style: React.ComponentProps<typeof Animated.View>['style'];
  children: React.ReactNode;
}) {
  // Callbacks run on the JS thread; the list is short, so this keeps the logic simple.
  const pan = usePanGesture({
    enabled,
    runOnJS: true,
    activateAfterLongPress: 350,
    onActivate: onBegin,
    onUpdate: (e) => onMove(e.translationY),
    onFinalize: onEnd,
  });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={(e) => onLayout(e.nativeEvent.layout.height)} style={style}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    lifted: {
      shadowColor: t.shadow,
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
  });
