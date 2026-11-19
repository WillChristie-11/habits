import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EntryType, JournalEntry } from '../../types';
import { useStore } from '../../store';
import { Button, Chip, Input, Label } from '../ui';
import { prettyDate } from '../../lib/dates';
import { useThemedStyles, type Theme } from '../../theme';

export const ENTRY_LABELS: Record<EntryType, string> = {
  intention: 'Intention',
  reflection: 'Reflection',
  weekly: 'Weekly review',
  note: 'Note to future me',
};

interface Props {
  /** existing entry to edit, or a new one of `type` for `date` */
  entry: JournalEntry | null;
  type: EntryType;
  date: string;
  onClose(): void;
}

/** Edit an intention, a reflection or a note. (Weekly reviews have their own screen.) */
export function EntryEditor({ entry, type, date, onClose }: Props) {
  const s = useThemedStyles(makeStyles);
  const { habits, saveEntry, updateEntry, deleteEntry } = useStore();
  const d = entry?.data ?? {};
  const [text, setText] = useState(d.text ?? '');
  const [wentWell, setWentWell] = useState(d.wentWell ?? '');
  const [inTheWay, setInTheWay] = useState(d.inTheWay ?? '');
  const [habitId, setHabitId] = useState<number | null>(entry?.habit_id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tracked = habits.filter((h) => h.kind === 'habit');

  const data: Record<string, string> =
    type === 'reflection' ? { ...d, wentWell: wentWell.trim(), inTheWay: inTheWay.trim() } : { ...d, text: text.trim() };
  const canSave = type === 'reflection' ? !!(wentWell.trim() || inTheWay.trim()) : !!text.trim();

  const save = async () => {
    if (entry) {
      if (type === 'note' && habitId !== entry.habit_id) {
        // Moving a note to another habit: re-create it under that habit.
        await deleteEntry(entry.id);
        await saveEntry('note', entry.date, data, habitId);
      } else await updateEntry(entry.id, data);
    } else await saveEntry(type, date, data, type === 'note' ? habitId : null);
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.screen}>
        <View style={s.bar}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={s.barBtn}>Cancel</Text>
          </Pressable>
          <Text style={s.barTitle}>{ENTRY_LABELS[type]}</Text>
          <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
            <Text style={[s.barBtn, { fontWeight: '700' }, !canSave && { opacity: 0.35 }]}>Save</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.date}>{prettyDate(entry?.date ?? date)}</Text>
          {type === 'reflection' ? (
            <>
              <Label>What went well?</Label>
              <Input value={wentWell} onChangeText={setWentWell} multiline autoFocus={!entry} placeholder="One line is plenty" />
              <Label>What got in the way?</Label>
              <Input value={inTheWay} onChangeText={setInTheWay} multiline placeholder="No judgement, just notes" />
            </>
          ) : (
            <>
              <Label>{type === 'intention' ? 'Today is for' : type === 'note' ? 'Note' : 'Text'}</Label>
              <Input
                value={text}
                onChangeText={setText}
                multiline
                autoFocus={!entry}
                placeholder={type === 'note' ? 'Something future you should hear' : ''}
              />
              {type === 'note' && (
                <>
                  <Label hint="optional">About</Label>
                  <View style={s.chips}>
                    <Chip label="General" active={habitId == null} onPress={() => setHabitId(null)} />
                    {tracked.map((h) => (
                      <Chip key={h.id} label={h.name} active={habitId === h.id} onPress={() => setHabitId(h.id)} />
                    ))}
                  </View>
                  <Text style={s.help}>
                    A note about a habit comes back once: on its motivation sheet and next reminder, the next time
                    it slips (missed two days running, or two days without a session for avoid habits).
                  </Text>
                </>
              )}
            </>
          )}
          {entry && (
            <View style={{ marginTop: 32 }}>
              <Button
                kind="danger"
                title={confirmDelete ? 'Tap again to delete' : 'Delete entry'}
                onPress={async () => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  await deleteEntry(entry.id);
                  onClose();
                }}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    barTitle: { fontSize: 16, fontWeight: '600', color: t.text },
    barBtn: { fontSize: 16, color: t.accent },
    content: { padding: 16, paddingBottom: 60 },
    date: { fontSize: 13, color: t.textMuted, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    help: { fontSize: 13, color: t.textMuted, marginTop: 10, lineHeight: 18 },
  });
