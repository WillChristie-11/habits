import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Input } from './ui';
import { useThemedStyles, type Theme } from '../theme';

interface Props {
  steps: string[];
  /** index of the next step to do */
  current: number;
  onChange(steps: string[], current: number): void;
}

/**
 * Ordered ladder of small steps. ↑ ↓ reorder, ✕ removes, tapping a step makes it the next one.
 * The current index follows its step when steps move.
 */
export function StepList({ steps, current, onChange }: Props) {
  const s = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...steps, v], current);
    setDraft('');
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    const cur = current === i ? j : current === j ? i : current;
    onChange(next, cur);
  };
  const remove = (i: number) => {
    const next = steps.filter((_, k) => k !== i);
    onChange(next, Math.min(current > i ? current - 1 : current, next.length));
  };

  return (
    <View style={{ gap: 6 }}>
      {steps.map((step, i) => {
        const isNext = i === current;
        const isDone = i < current;
        return (
          <View key={`${i}-${step}`} style={[s.item, isNext && s.itemNext]}>
            <Text style={[s.num, isNext && s.numNext]}>{isDone ? '✓' : i + 1}</Text>
            <Pressable style={{ flex: 1 }} onPress={() => onChange(steps, i)} accessibilityHint="Make this the next step">
              <Text style={[s.text, isDone && s.textDone]}>{step}</Text>
              {isNext && <Text style={s.nextLabel}>next step</Text>}
            </Pressable>
            <Pressable onPress={() => move(i, -1)} hitSlop={6} disabled={i === 0} accessibilityLabel="Move up">
              <Text style={[s.ctl, i === 0 && s.ctlOff]}>↑</Text>
            </Pressable>
            <Pressable onPress={() => move(i, 1)} hitSlop={6} disabled={i === steps.length - 1} accessibilityLabel="Move down">
              <Text style={[s.ctl, i === steps.length - 1 && s.ctlOff]}>↓</Text>
            </Pressable>
            <Pressable onPress={() => remove(i)} hitSlop={6} accessibilityLabel={`Remove step ${i + 1}`}>
              <Text style={s.ctl}>✕</Text>
            </Pressable>
          </View>
        );
      })}
      {steps.length > 0 && current >= steps.length && (
        <Pressable onPress={() => onChange(steps, 0)}>
          <Text style={s.restart}>All steps done · start the ladder again</Text>
        </Pressable>
      )}
      <View style={s.addRow}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={steps.length ? 'Add the next small step' : 'e.g. Find 1 role'}
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
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 10,
      borderWidth: 1.5,
      borderColor: t.surface,
    },
    itemNext: { borderColor: t.accent },
    num: { width: 18, textAlign: 'center', fontSize: 13, fontWeight: '700', color: t.textMuted },
    numNext: { color: t.accent },
    text: { fontSize: 15, color: t.text },
    textDone: { color: t.textMuted, textDecorationLine: 'line-through' },
    nextLabel: { fontSize: 11, color: t.accent, fontWeight: '600', marginTop: 1 },
    ctl: { fontSize: 15, color: t.textMuted, paddingHorizontal: 3 },
    ctlOff: { opacity: 0.25 },
    restart: { fontSize: 13, color: t.accent, fontWeight: '600', paddingVertical: 4 },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addBtn: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
    addText: { color: t.onAccent, fontWeight: '600', fontSize: 15 },
  });
