import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import type { DayState } from '../types';
import { colors } from '../theme';

const R = 4.5;

/** A single day marker. Each state is distinct by shape, not only colour. */
export function Dot({ state, size = 12 }: { state: DayState; size?: number }) {
  const c = size / 2;
  const r = (R / 12) * size;
  return (
    <Svg width={size} height={size}>
      {state === 'done' && <Circle cx={c} cy={c} r={r} fill={colors.accent} />}
      {state === 'missed' && <Circle cx={c} cy={c} r={r - 0.6} stroke={colors.red} strokeWidth={1.4} fill="none" />}
      {state === 'skipped' && (
        <>
          <Circle cx={c} cy={c} r={r - 0.6} stroke={colors.skip} strokeWidth={1.2} fill="none" />
          <Line x1={c - r + 1.6} y1={c} x2={c + r - 1.6} y2={c} stroke={colors.skip} strokeWidth={1.4} />
        </>
      )}
      {state === 'paused' && <Circle cx={c} cy={c} r={r} fill={colors.paused} />}
      {state === 'pending' && (
        <Circle cx={c} cy={c} r={r - 0.6} stroke={colors.faint} strokeWidth={1.4} fill="none" />
      )}
      {state === 'none' && <Circle cx={c} cy={c} r={1.4} fill={colors.faint} />}
    </Svg>
  );
}

export function DotRow({ states, size = 10 }: { states: DayState[]; size?: number }) {
  return (
    <Svg width={states.length * size} height={size}>
      {states.map((s, i) => {
        const cx = i * size + size / 2;
        const c = size / 2;
        const r = (R / 12) * size + 0.3;
        switch (s) {
          case 'done':
            return <Circle key={i} cx={cx} cy={c} r={r} fill={colors.accent} />;
          case 'missed':
            return <Circle key={i} cx={cx} cy={c} r={r - 0.6} stroke={colors.red} strokeWidth={1.2} fill="none" />;
          case 'skipped':
            return (
              <React.Fragment key={i}>
                <Circle cx={cx} cy={c} r={r - 0.6} stroke={colors.skip} strokeWidth={1.1} fill="none" />
                <Line x1={cx - r + 1.4} y1={c} x2={cx + r - 1.4} y2={c} stroke={colors.skip} strokeWidth={1.2} />
              </React.Fragment>
            );
          case 'paused':
            return <Circle key={i} cx={cx} cy={c} r={r} fill={colors.paused} />;
          case 'pending':
            return <Circle key={i} cx={cx} cy={c} r={r - 0.6} stroke={colors.faint} strokeWidth={1.2} fill="none" />;
          default:
            return <Circle key={i} cx={cx} cy={c} r={1.3} fill={colors.faint} />;
        }
      })}
    </Svg>
  );
}
