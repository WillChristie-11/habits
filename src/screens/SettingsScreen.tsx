import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { exportBackup, pickBackup, restoreBackup } from '../lib/backup';
import { router } from 'expo-router';
import { useStore } from '../store';
import { Button, Help, Label, Segmented, Toggle } from '../components/ui';
import { MessageList } from '../components/MessageList';
import { useThemedStyles, type AppearanceMode, type Theme } from '../theme';

export function SettingsScreen() {
  const s = useThemedStyles(makeStyles);
  const { settings, updateSettings, updateReminders, reloadAll } = useStore();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const a = settings.appearance;
  const r = settings.reminders;
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
        <View style={{ marginTop: 8 }}>
          <Help>
            {a.mode === 'system'
              ? 'Follows the iPhone: Forest when it’s light, Midnight when it’s dark.'
              : a.mode === 'light'
                ? 'Always Forest (light).'
                : 'Always Midnight (dark).'}
          </Help>
        </View>

        <Text style={[s.group, { marginTop: 32 }]}>Reminders</Text>
        <Pressable
          onPress={() => router.push('/reminders')}
          style={({ pressed }) => [s.permBox, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.timeLabel}>Reminders ›</Text>
          <Help>Every reminder in one place: turn them on or off, change times, see what’s coming up.</Help>
        </Pressable>

        <Text style={[s.group, { marginTop: 32 }]}>Motivational messages</Text>
        <View style={{ marginTop: 8, marginBottom: 10 }}>
          <Help>
            General lines for any habit. Notifications rotate through these and each habit’s own why and messages, one a
            day.
          </Help>
        </View>
        <MessageList
          value={r.messages}
          onChange={(messages) => updateReminders({ messages })}
          placeholder="e.g. Small steps still count"
        />

        <Text style={[s.group, { marginTop: 32 }]}>Backup</Text>
        <View style={{ marginTop: 8, marginBottom: 10 }}>
          <Help>
            Everything lives only on this phone. Export saves one JSON file (habits, check-offs, journal, settings)
            wherever you choose; restoring replaces everything with that file.
          </Help>
        </View>
        <View style={{ gap: 10 }}>
          <Button
            kind="secondary"
            title={busy === 'export' ? 'Preparing…' : 'Export backup'}
            disabled={!!busy}
            onPress={async () => {
              setBusy('export');
              try {
                await exportBackup();
              } catch (e) {
                Alert.alert('Export failed', String((e as Error).message ?? e));
              } finally {
                setBusy(null);
              }
            }}
          />
          <Button
            kind="secondary"
            title={busy === 'import' ? 'Restoring…' : 'Restore from backup'}
            disabled={!!busy}
            onPress={async () => {
              try {
                const picked = await pickBackup();
                if (!picked) return;
                const { habits, records, pages } = picked.counts;
                Alert.alert(
                  'Replace everything?',
                  `${picked.name}\n${habits} habits and anchors, ${records} check-offs, ${pages} journal pages.\n\nThis replaces all data on this phone.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Replace',
                      style: 'destructive',
                      onPress: async () => {
                        setBusy('import');
                        try {
                          await restoreBackup(picked.backup);
                          await reloadAll();
                          Alert.alert('Restored', 'Your backup is back in place.');
                        } catch (e) {
                          Alert.alert('Restore failed', String((e as Error).message ?? e));
                        } finally {
                          setBusy(null);
                        }
                      },
                    },
                  ],
                );
              } catch (e) {
                Alert.alert('Can’t use that file', String((e as Error).message ?? e));
              }
            }}
          />
        </View>

        <Text style={[s.group, { marginTop: 32 }]}>Opening screen</Text>
        <View style={{ marginTop: 10 }}>
          <Toggle
            label="Now page"
            note="When you open the app, or come back after 5 minutes away: what this moment is for. Tap or swipe up for Today."
            value={settings.nowPage}
            onChange={(v) => updateSettings({ nowPage: v })}
          />
        </View>

        <Text style={[s.group, { marginTop: 32 }]}>Check-off</Text>
        <View style={{ marginTop: 10 }}>
          <Toggle
            label="Auto-hide feeling score"
            note="The 1–5 “how do you feel” card closes after about 7 seconds if you don’t tap."
            value={settings.feelingAutoDismiss}
            onChange={(v) => updateSettings({ feelingAutoDismiss: v })}
          />
        </View>

        <Text style={[s.group, { marginTop: 32 }]}>Timers</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          <Toggle
            label="Keep screen on during Focus"
            note="Also on the Focus screen itself."
            value={settings.timerPrefs.keepAwake}
            onChange={(v) => updateSettings({ timerPrefs: { ...settings.timerPrefs, keepAwake: v } })}
          />
          <Toggle
            label="Halfway haptic in Meditate"
            note="One light tap at the halfway point. Start and end always have one."
            value={settings.timerPrefs.meditateHalfway}
            onChange={(v) => updateSettings({ timerPrefs: { ...settings.timerPrefs, meditateHalfway: v } })}
          />
        </View>
      </ScrollView>
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
    permBox: { backgroundColor: t.surface, borderRadius: 12, padding: 12, marginTop: 10 },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    timeLabel: { fontSize: 16, color: t.text },
  });
