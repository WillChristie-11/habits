import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import type { DayState } from '../types';
import { status, useTheme, type Theme } from '../theme';

/**
 * Day marker shapes. Each state differs by shape, not only colour:
 * done = accent fill · missed = empty-colour fill · skipped = outline, no fill ·
 * paused = grey fill · today (not yet) = thick empty ring · not expected = tiny dot.
 */
function shape(state: DayState, cx: number, cy: number, r: number, t: Theme, key?: React.Key) {
  switch (state) {
    case 'done':
      return <Circle key={key} cx={cx} cy={cy} r={r} fill={t.accent} />;
    case 'missed':
      return <Circle key={key} cx={cx} cy={cy} r={r} fill={t.dotEmpty} />;
    case 'skipped':
      return <Circle key={key} cx={cx} cy={cy} r={r - 0.7} stroke={status.skipped} strokeWidth={1.3} fill="none" />;
    case 'paused':
      return <Circle key={key} cx={cx} cy={cy} r={r} fill={status.paused} />;
    case 'pending':
      return <Circle key={key} cx={cx} cy={cy} r={r - 0.9} stroke={t.dotEmpty} strokeWidth={1.8} fill="none" />;
    default:
      return <Circle key={key} cx={cx} cy={cy} r={Math.max(1.2, r * 0.3)} fill={t.dotEmpty} />;
  }
}

export function Dot({ state, size = 12 }: { state: DayState; size?: number }) {
  const t = useTheme();
  return <Svg width={size} height={size}>{shape(state, size / 2, size / 2, size * 0.4, t)}</Svg>;
}

export function DotRow({ states, size = 10 }: { states: DayState[]; size?: number }) {
  const t = useTheme();
  return (
    <Svg width={states.length * size} height={size}>
      {states.map((s, i) => shape(s, i * size + size / 2, size / 2, size * 0.4, t, i))}
    </Svg>
  );
}
