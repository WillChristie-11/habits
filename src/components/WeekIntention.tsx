import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store';
import { addDays, weekStart } from '../lib/dates';
import { yesterdayLine } from '../lib/dayClose';
import { Button, Input } from './ui';
import { useThemedStyles, type Theme } from '../theme';

/** "This week is for …" at the top of Today all week; tap to edit. */
export function WeekIntentionLine() {
  const s = useThemedStyles(makeStyles);
  const { weeks, ctx } = useStore();
  const week = weekStart(ctx.today);
  const text = weeks[week];
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Pressable onPress={() => setEditing(true)} style={s.line} accessibilityRole="button" accessibilityHint="Edit">
        {text ? (
          <>
            <Text style={s.label}>This week is for</Text>
            <Text style={s.text}>{text}</Text>
          </>
        ) : (
          <Text style={s.invite}>＋ This week is for…</Text>
        )}
      </Pressable>
      {editing && <WeekIntentionEditor week={week} onClose={() => setEditing(false)} />}
    </>
  );
}

export function WeekIntentionEditor({ week, onClose }: { week: string; onClose(): void }) {
  const s = useThemedStyles(makeStyles);
  const { weeks, saveWeek } = useStore();
  const [value, setValue] = useState(weeks[week] ?? '');
  const save = async () => {
    await saveWeek(week, value);
    onClose();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.card}>
          <Text style={s.title}>This week is for…</Text>
          <Input value={value} onChangeText={setValue} autoFocus maxLength={140} returnKeyType="done" onSubmitEditing={save} />
          <View style={s.actions}>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" title="Cancel" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Save" onPress={save} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    line: { marginTop: 10, paddingHorizontal: 4, paddingVertical: 4 },
    label: { fontSize: 12, fontWeight: '700', color: t.textMuted },
    text: { fontSize: 18, fontWeight: '600', color: t.text, marginTop: 2, lineHeight: 24 },
    invite: { fontSize: 14, color: t.textMuted, fontWeight: '500' },
    wrap: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: t.scrim },
    card: { backgroundColor: t.background, borderRadius: 20, padding: 20, gap: 12 },
    title: { fontSize: 22, fontWeight: '700', color: t.text },
    actions: { flexDirection: 'row', gap: 10 },
  });

/** "Yesterday you said: better at …" from last night's Close the day; tap to hide for the day. */
export function YesterdayBetterLine() {
  const s = useThemedStyles(makeStyles);
  const { dayCloses, ctx, settings, updateSettings } = useStore();
  const line = yesterdayLine(dayCloses.find((c) => c.date === addDays(ctx.today, -1))?.better);
  if (!line || settings.betterHiddenOn === ctx.today) return null;
  return (
    <Pressable
      onPress={() => updateSettings({ betterHiddenOn: ctx.today })}
      style={s.line}
      accessibilityRole="button"
      accessibilityHint="Hides it for today"
    >
      <Text style={s.text}>{line}</Text>
    </Pressable>
  );
}
