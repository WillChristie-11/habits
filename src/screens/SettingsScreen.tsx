import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { Help, Label, Segmented, Toggle } from '../components/ui';
import { themes, useThemedStyles, type AppearanceMode, type Theme, type ThemeId } from '../theme';

export function SettingsScreen() {
  const s = useThemedStyles(makeStyles);
  const { settings, updateSettings } = useStore();
  const a = settings.appearance;
  const setAppearance = (patch: Partial<typeof a>) => updateSettings({ appearance: { ...a, ...patch } });

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.barTitle}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={s.barBtn}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.group}>Appearance</Text>
        <Label>Mode</Label>
        <Segmented<AppearanceMode>
          value={a.mode}
          onChange={(mode) => setAppearance({ mode })}
          options={[
            { value: 'system', label: 'Match iPhone' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Label>Light theme</Label>
        <ThemePicker value={a.light} onChange={(light) => setAppearance({ light, mode: a.mode === 'dark' ? 'light' : a.mode })} />
        <Label>Dark theme</Label>
        <ThemePicker value={a.dark} onChange={(dark) => setAppearance({ dark, mode: a.mode === 'light' ? 'dark' : a.mode })} />
        <View style={{ marginTop: 8 }}>
          <Help>
            {a.mode === 'system'
              ? 'Switches between your light and dark theme with the iPhone’s appearance.'
              : `Always uses your ${a.mode} theme.`}
          </Help>
        </View>

        <Text style={[s.group, { marginTop: 32 }]}>Check-off</Text>
        <View style={{ marginTop: 10 }}>
          <Toggle
            label="Auto-hide feeling score"
            note="The 1–5 “how do you feel” card closes after ~4 s if you don’t tap."
            value={settings.feelingAutoDismiss}
            onChange={(v) => updateSettings({ feelingAutoDismiss: v })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ThemePicker({ value, onChange }: { value: ThemeId; onChange(id: ThemeId): void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.themes}>
      {(Object.values(themes) as Theme[]).map((th) => {
        const active = th.id === value;
        return (
          <Pressable
            key={th.id}
            onPress={() => onChange(th.id)}
            style={[s.swatch, { backgroundColor: th.background, borderColor: active ? th.accent : th.border }, active && s.swatchActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${th.name} theme`}
          >
            <View style={[s.swatchCard, { backgroundColor: th.surface }]}>
              <View style={[s.swatchDot, { backgroundColor: th.accent }]} />
              <View style={[s.swatchDot, { backgroundColor: th.dotEmpty }]} />
              <View style={[s.swatchLine, { backgroundColor: th.textMuted }]} />
            </View>
            <Text style={[s.swatchName, { color: th.text }]}>
              {th.name}
              {active ? '  ✓' : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 12,
    },
    barTitle: { fontSize: 22, fontWeight: '700', color: t.text },
    barBtn: { fontSize: 16, color: t.accent, fontWeight: '600' },
    content: { padding: 16, paddingBottom: 80 },
    group: { fontSize: 17, fontWeight: '600', color: t.text },
    themes: { flexDirection: 'row', gap: 12 },
    swatch: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 10 },
    swatchActive: { borderWidth: 2.5 },
    swatchCard: { borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
    swatchDot: { width: 9, height: 9, borderRadius: 5 },
    swatchLine: { flex: 1, height: 4, borderRadius: 2, opacity: 0.5 },
    swatchName: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  });
