import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTheme, useThemedStyles, type Theme } from '../theme';

interface Props {
  dateLine: string;
  title: string;
  /** Right side of the title row (e.g. the progress ring). */
  right?: React.ReactNode;
  /** Shown under the title. */
  below?: React.ReactNode;
  /** Small text links under the title (e.g. "← Back to today"). */
  links?: { label: string; onPress: () => void; strong?: boolean }[];
}

/** Shared header for the tabs: date and settings; big title; optional small links. (＋ floats bottom-right.) */
export function ScreenHeader({ dateLine, title, right, below, links = [] }: Props) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  return (
    <View style={s.header}>
      <View style={s.topRow}>
        <Text style={s.date}>{dateLine}</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={12}
          style={({ pressed }) => [s.gearBtn, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <SymbolView name="gearshape" size={24} tintColor={t.textMuted} fallback={<Text style={s.gearText}>⚙︎</Text>} />
        </Pressable>
      </View>
      <View style={s.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          {below && <View style={{ marginTop: 8 }}>{below}</View>}
          {links.length > 0 && (
            <View style={s.actions}>
              {links.map((l) => (
                <Pressable key={l.label} onPress={l.onPress} hitSlop={10} accessibilityRole="button">
                  <Text style={[s.link, l.strong && s.linkStrong]}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
    date: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
    gearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
    gearText: { fontSize: 22, color: t.textMuted },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    title: { fontSize: 32, fontWeight: '700', color: t.text },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
    link: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
    linkStrong: { color: t.accent, fontWeight: '700' },
  });
