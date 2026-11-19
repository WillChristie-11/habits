import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

export function ProgressRing({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${done} of ${total} done today`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - pct)}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {complete ? (
          <Text style={[styles.label, { color: colors.accent }]}>✓</Text>
        ) : (
          <Text style={styles.label}>
            {done}
            <Text style={styles.total}>/{total}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 17, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  total: { fontSize: 13, color: colors.sub, fontWeight: '500' },
});
