import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Input } from './ui';
import { useThemedStyles, type Theme } from '../theme';

/** Editable list of short motivational lines. */
export function MessageList({
  value,
  onChange,
  placeholder = 'Add a line that gets you going',
}: {
  value: string[];
  onChange(next: string[]): void;
  placeholder?: string;
}) {
  const s = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: 6 }}>
      {value.map((m, i) => (
        <View key={`${i}-${m}`} style={s.item}>
          <Text style={s.text}>{m}</Text>
          <Pressable
            onPress={() => onChange(value.filter((_, j) => j !== i))}
            hitSlop={10}
            accessibilityLabel={`Remove “${m}”`}
          >
            <Text style={s.x}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={s.addRow}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          onSubmitEditing={add}
          returnKeyType="done"
          style={{ flex: 1 }}
        />
        <Pressable onPress={add} disabled={!draft.trim()} style={[s.addBtn, !draft.trim() && { opacity: 0.4 }]}>
          <Text style={s.addText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    text: { flex: 1, fontSize: 15, color: t.text },
    x: { fontSize: 14, color: t.textMuted },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addBtn: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
    addText: { color: t.onAccent, fontWeight: '600', fontSize: 15 },
  });
