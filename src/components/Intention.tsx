import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store';
import { Button, Input } from './ui';
import { useThemedStyles, type Theme } from '../theme';

/** Today's (or a given day's) intention text, if one was written. */
export function useIntention(date: string): string | null {
  const { entries } = useStore();
  const e = entries.find((x) => x.type === 'intention' && x.date === date);
  return e?.data.text?.trim() || null;
}

/**
 * "Today is for ___" card. Asked once on the first open each day (skippable); afterwards shown at
 * the top of Today, tap to edit. Stored per day as a journal entry.
 */
export function IntentionPrompt({
  visible,
  date,
  initial,
  onClose,
}: {
  visible: boolean;
  date: string;
  initial: string;
  onClose(): void;
}) {
  const s = useThemedStyles(makeStyles);
  const { saveEntry, updateSettings, ctx } = useStore();
  const [text, setText] = useState(initial);
  const isToday = date === ctx.today;

  const finish = async (save: boolean) => {
    if (save) await saveEntry('intention', date, { text: text.trim() });
    if (isToday) await updateSettings({ intentionAskedOn: date });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => finish(false)} accessibilityLabel="Skip" />
        <View style={s.card}>
          <Text style={s.kicker}>{isToday ? 'Good morning' : 'Intention'}</Text>
          <Text style={s.title}>{isToday ? 'Today is for…' : 'That day was for…'}</Text>
          <Input
            value={text}
            onChangeText={setText}
            placeholder="e.g. one good application, and an early night"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => text.trim() && finish(true)}
            maxLength={140}
          />
          <View style={s.actions}>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" title={initial ? 'Cancel' : 'Skip'} onPress={() => finish(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Save" disabled={!text.trim()} onPress={() => finish(true)} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Slim line at the top of Today: "Today is for …" (tap to edit), or a quiet invitation. */
export function IntentionLine({ date, onEdit }: { date: string; onEdit(): void }) {
  const s = useThemedStyles(makeStyles);
  const { ctx } = useStore();
  const text = useIntention(date);
  if (!text) {
    if (date !== ctx.today) return null;
    return (
      <Pressable onPress={onEdit} hitSlop={6} style={s.invite} accessibilityRole="button">
        <Text style={s.inviteText}>＋ Today is for…</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onEdit} style={s.line} accessibilityRole="button" accessibilityHint="Edit">
      <Text style={s.lineLabel}>{date === ctx.today ? 'Today is for' : 'This day was for'}</Text>
      <Text style={s.lineText}>{text}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: t.scrim },
    card: { backgroundColor: t.background, borderRadius: 20, padding: 20, gap: 12 },
    kicker: { fontSize: 12, fontWeight: '700', color: t.accent, textTransform: 'uppercase', letterSpacing: 0.6 },
    title: { fontSize: 24, fontWeight: '700', color: t.text },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    line: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 4 },
    lineLabel: { fontSize: 12, fontWeight: '700', color: t.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
    lineText: { fontSize: 18, fontWeight: '600', color: t.text, marginTop: 2, lineHeight: 24 },
    invite: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 4 },
    inviteText: { fontSize: 14, color: t.textMuted, fontWeight: '500' },
  });
