import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, useThemedStyles, type Theme } from '../theme';

export function ProgressRing({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${done} of ${total} done`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - pct)}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        {complete ? (
          <Text style={[s.label, { color: t.accent }]}>✓</Text>
        ) : (
          <Text style={s.label}>
            {done}
            <Text style={s.total}>/{total}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 17, fontWeight: '600', color: t.text, fontVariant: ['tabular-nums'] },
    total: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
  });
