import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { exportBackup, pickBackup, restoreBackup } from '../lib/backup';
import { router } from 'expo-router';
import { useStore } from '../store';
import { Button, Help, Label, Segmented, Stepper, Toggle } from '../components/ui';
import { TimeField } from '../components/TimeField';
import { getPermission, requestPermission, type PermissionState } from '../lib/notifications';
import { formatTime } from '../lib/dates';
import { nudgeStart } from '../lib/reminders';
import { MessageList } from '../components/MessageList';
import { useThemedStyles, type AppearanceMode, type Theme } from '../theme';

export function SettingsScreen() {
  const s = useThemedStyles(makeStyles);
  const { settings, updateSettings, updateReminders, reloadAll } = useStore();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const a = settings.appearance;
  const r = settings.reminders;
  const [perm, setPerm] = useState<PermissionState | null>(null);
  useEffect(() => {
    getPermission().then(setPerm);
  }, []);
  const enablePermission = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'denied') Linking.openSettings();
  };
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
        {perm && perm !== 'granted' && perm !== 'unsupported' && (
          <View style={s.permBox}>
            <Help>
              {perm === 'denied'
                ? 'Notifications are off for this app. Banners still show in the app.'
                : 'Allow notifications to get reminders when the app is closed.'}
            </Help>
            <View style={{ marginTop: 10 }}>
              <Button
                kind="primary"
                title={perm === 'denied' ? 'Open iPhone Settings' : 'Turn on notifications'}
                onPress={enablePermission}
              />
            </View>
          </View>
        )}
        <View style={{ marginTop: 10, gap: 10 }}>
          <Toggle
            label="Morning reminder"
            note="Banner + notification listing unfinished morning habits."
            value={r.morningEnabled}
            onChange={(v) => updateReminders({ morningEnabled: v })}
          />
          {r.morningEnabled && (
            <View style={s.timeRow}>
              <Text style={s.timeLabel}>Time</Text>
              <TimeField value={r.morningTime} onChange={(morningTime) => updateReminders({ morningTime })} />
            </View>
          )}
          <Toggle
            label="Evening nudge"
            note={`From ${formatTime(nudgeStart(r))}: what’s left and how long until your deadline.`}
            value={r.eveningEnabled}
            onChange={(v) => updateReminders({ eveningEnabled: v })}
          />
          <View style={s.timeRow}>
            <Text style={s.timeLabel}>Deadline</Text>
            <TimeField value={r.eveningDeadline} onChange={(eveningDeadline) => updateReminders({ eveningDeadline })} />
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Help>Reminders for anchors and timed habits are set on each item.</Help>
        </View>

        <Text style={[s.group, { marginTop: 32 }]}>Random check-ins</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          <Toggle
            label="Check-ins"
            note="A few nudges at unpredictable times about something still open today."
            value={r.checkins.enabled}
            onChange={(enabled) => updateReminders({ checkins: { ...r.checkins, enabled } })}
          />
          {r.checkins.enabled && (
            <>
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>Per day</Text>
                <Stepper
                  value={r.checkins.count}
                  min={1}
                  max={6}
                  onChange={(count) => updateReminders({ checkins: { ...r.checkins, count } })}
                />
              </View>
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>From</Text>
                <TimeField
                  value={r.checkins.start}
                  onChange={(start) => updateReminders({ checkins: { ...r.checkins, start } })}
                />
              </View>
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>Until</Text>
                <TimeField
                  value={r.checkins.end}
                  onChange={(end) => updateReminders({ checkins: { ...r.checkins, end } })}
                />
              </View>
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>At least apart</Text>
                <Stepper
                  value={r.checkins.spacing}
                  min={30}
                  max={240}
                  step={15}
                  suffix="min"
                  onChange={(spacing) => updateReminders({ checkins: { ...r.checkins, spacing } })}
                />
              </View>
            </>
          )}
        </View>

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
            Everything lives only on this phone. Export saves one JSON file (habits, check-offs, journal, settings) wherever
            you choose; restoring replaces everything with that file.
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

        <Text style={[s.group, { marginTop: 32 }]}>Check-off</Text>
        <View style={{ marginTop: 10 }}>
          <Toggle
            label="Auto-hide feeling score"
            note="The 1–5 “how do you feel” card closes after about 7 seconds if you don’t tap."
            value={settings.feelingAutoDismiss}
            onChange={(v) => updateSettings({ feelingAutoDismiss: v })}
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
