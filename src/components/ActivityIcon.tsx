import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { guessIcon, isSymbolName } from '../lib/activityIcons';
import type { Habit } from '../types';
import { onTile, tileColors } from '../theme';

/** Any SF Symbol name ("figure.run", "book"); suggestions live in lib/activityIcons. */
export type ActivityIconName = string;

/**
 * An activity's colour and SF Symbol (stored in its meta). Without a saved icon, one is guessed
 * from its name ("Reading" gets a book); older activities get a stable colour.
 */
export function activityLook(h: Pick<Habit, 'id' | 'meta' | 'name'>): { color: string; icon: ActivityIconName } {
  const m = (h.meta ?? {}) as { color?: unknown; icon?: unknown };
  const color =
    typeof m.color === 'string' && (tileColors as readonly string[]).includes(m.color)
      ? m.color
      : tileColors[Math.abs(h.id) % tileColors.length];
  const icon = isSymbolName(m.icon) ? m.icon.trim() : guessIcon(h.name);
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
        name={icon as SymbolViewProps['name']}
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
