import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useStore } from '../store';
import { MAX_GOALS, type Goal } from '../lib/goals';
import { Button, Chip, Help, Input, Label } from '../components/ui';
import { useThemedStyles, type Theme } from '../theme';

/** Goals: up to 3 long-term goals, each with a why in your words and linked habits / activities. */
export function GoalsScreen() {
  const s = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ edit?: string }>();
  const { goals } = useStore();
  const [editing, setEditing] = useState<number | 'new' | null>(
    params.edit ? Number(params.edit) : goals.length ? null : 'new',
  );
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const current = typeof editing === 'number' ? goals.find((g) => g.id === editing) : undefined;

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.barTitle}>Goals</Text>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <Text style={s.barBtn}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {editing != null ? (
          <GoalForm key={String(editing)} goal={current} onDone={() => setEditing(null)} />
        ) : (
          <>
            <Help>One to three long-term goals. Today’s card shows a step toward one of them each day.</Help>
            {goals.map((g) => (
              <Pressable key={g.id} onPress={() => setEditing(g.id)} style={s.row} accessibilityRole="button">
                <Text style={s.rowName}>{g.name}</Text>
                {g.why ? (
                  <Text style={s.rowWhy} numberOfLines={1}>
                    {g.why}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {goals.length < MAX_GOALS && (
              <View style={{ marginTop: 12 }}>
                <Button kind="secondary" title="Add a goal" onPress={() => setEditing('new')} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone(): void }) {
  const s = useThemedStyles(makeStyles);
  const { habits, goals, saveGoal, removeGoal } = useStore();
  const [name, setName] = useState(goal?.name ?? '');
  const [why, setWhy] = useState(goal?.why ?? '');
  const [links, setLinks] = useState<number[]>(goal?.links ?? []);
  const linkable = habits.filter((h) => (h.kind === 'habit' && h.habit_kind !== 'cut_back') || h.kind === 'activity');
  const toggle = (id: number) => setLinks((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const save = async () => {
    if (!name.trim()) return;
    await saveGoal({ id: goal?.id, name, why: why || null, links, order: goal?.order ?? goals.length });
    onDone();
  };
  return (
    <View>
      <Label>Goal</Label>
      <Input value={name} onChangeText={setName} placeholder="e.g. Land a GIS job" autoFocus={!goal} maxLength={80} />
      <Label hint="in your words">Why</Label>
      <Input value={why} onChangeText={setWhy} placeholder="What it would change" multiline maxLength={200} />
      <Label>Linked habits and activities</Label>
      <View style={s.chips}>
        {linkable.map((h) => (
          <Chip key={h.id} label={h.name} active={links.includes(h.id)} onPress={() => toggle(h.id)} />
        ))}
      </View>
      <Help>Avoid habits linked here give Today’s step its next rung.</Help>
      <View style={{ marginTop: 20, gap: 10 }}>
        <Button title="Save" onPress={save} disabled={!name.trim()} />
        <Button kind="secondary" title="Cancel" onPress={onDone} />
        {goal && (
          <Button
            kind="secondary"
            title="Delete goal"
            onPress={() =>
              Alert.alert(`Delete ${goal.name}?`, 'Its typed steps are removed; your habits stay.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeGoal(goal.id).then(onDone) },
              ])
            }
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    barTitle: { fontSize: 20, fontWeight: '700', color: t.text },
    barBtn: { fontSize: 17, fontWeight: '600', color: t.accent },
    content: { paddingHorizontal: 16, paddingBottom: 60 },
    row: { backgroundColor: t.surface, borderRadius: 12, padding: 14, marginTop: 10, gap: 2 },
    rowName: { fontSize: 17, fontWeight: '600', color: t.text },
    rowWhy: { fontSize: 14, color: t.textMuted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
