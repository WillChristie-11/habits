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
  /** Primary action, shown as a solid button. */
  addLabel?: string;
  onAdd?: () => void;
  /** Secondary inline actions shown small after the Add button. */
  links?: { label: string; onPress: () => void; strong?: boolean }[];
}

/** Shared header for the tabs: date + settings, big title, solid Add, small text links. */
export function ScreenHeader({ dateLine, title, right, addLabel = 'Add', onAdd, links = [] }: Props) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  return (
    <View style={s.header}>
      <View style={s.topRow}>
        <Text style={s.date}>{dateLine}</Text>
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
          <View style={s.actions}>
            {onAdd && (
              <Pressable
                onPress={onAdd}
                style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
              >
                <Text style={s.addText}>＋ {addLabel}</Text>
              </Pressable>
            )}
            {links.map((l) => (
              <Pressable key={l.label} onPress={l.onPress} hitSlop={10} accessibilityRole="button">
                <Text style={[s.link, l.strong && s.linkStrong]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
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
    actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
    addBtn: {
      backgroundColor: t.accent,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    addText: { color: t.onAccent, fontWeight: '700', fontSize: 15 },
    link: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
    linkStrong: { color: t.accent, fontWeight: '700' },
  });
