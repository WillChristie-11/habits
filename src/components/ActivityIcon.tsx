import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { Habit } from '../types';
import { onTile, tileColors } from '../theme';

/** SF Symbols offered when creating an activity. */
export const ACTIVITY_ICONS = [
  'figure.run',
  'bicycle',
  'figure.walk',
  'figure.pool.swim',
  'dumbbell',
  'figure.yoga',
  'figure.hiking',
  'figure.strengthtraining.traditional',
  'sportscourt',
  'guitars',
  'music.note',
  'book',
  'paintbrush',
  'leaf',
  'brain.head.profile',
  'heart',
] as const satisfies readonly SymbolViewProps['name'][];

export type ActivityIconName = (typeof ACTIVITY_ICONS)[number];

/** An activity's colour and SF Symbol (stored in its meta), with stable defaults for older ones. */
export function activityLook(h: Pick<Habit, 'id' | 'meta'>): { color: string; icon: ActivityIconName } {
  const m = (h.meta ?? {}) as { color?: unknown; icon?: unknown };
  const color =
    typeof m.color === 'string' && (tileColors as readonly string[]).includes(m.color)
      ? m.color
      : tileColors[Math.abs(h.id) % tileColors.length];
  const icon =
    typeof m.icon === 'string' && (ACTIVITY_ICONS as readonly string[]).includes(m.icon)
      ? (m.icon as ActivityIconName)
      : 'figure.run';
  return { color, icon };
}

/** A coloured rounded square with the activity's white SF Symbol. */
export function ActivityIcon({
  color,
  icon,
  size = 56,
  label,
}: {
  color: string;
  icon: ActivityIconName;
  size?: number;
  /** Letter shown where SF Symbols aren't available (web). */
  label?: string;
}) {
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: color }]}>
      <SymbolView
        name={icon}
        size={size * 0.5}
        tintColor={onTile}
        fallback={
          <Text style={[styles.fallback, { fontSize: size * 0.4 }]}>{(label ?? '•').slice(0, 1).toUpperCase()}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  fallback: { color: onTile, fontWeight: '700' },
});
