import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Frequency, FrequencyType, Habit, HabitInput, Section } from '../types';
import { useStore } from '../store';
import { Chip, Input, Label, Segmented, Stepper } from '../components/ui';
import { WEEKDAY_NAMES } from '../lib/dates';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  habit: Habit | null; // null = new
  defaultSection?: Section;
  onClose(): void;
}

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

export function HabitForm({ visible, habit, defaultSection = 'morning', onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible && <FormBody habit={habit} defaultSection={defaultSection} onClose={onClose} />}
    </Modal>
  );
}

function FormBody({ habit, defaultSection, onClose }: { habit: Habit | null; defaultSection: Section; onClose(): void }) {
  const { habits, addHabit, editHabit } = useStore();
  const [name, setName] = useState(habit?.name ?? '');
  const [section, setSection] = useState<Section>(habit?.section ?? defaultSection);
  const [ftype, setFtype] = useState<FrequencyType>(
    habit?.frequency.type ?? (defaultSection === 'week' ? 'weekly_count' : 'daily'),
  );
  const [count, setCount] = useState(habit?.frequency.count ?? 2);
  const [days, setDays] = useState<number[]>(habit?.frequency.days ?? [1, 3, 5]);
  const [n, setN] = useState(habit?.frequency.n ?? 2);
  const [why, setWhy] = useState(habit?.why ?? '');
  const [minimum, setMinimum] = useState(habit?.minimum_version ?? '');
  const [stackAfter, setStackAfter] = useState<number | null>(habit?.stack_after ?? null);

  // Anchors must be in the same section and must not create a loop back to this habit.
  const anchors = habits.filter((h) => {
    if (h.section !== section || h.id === habit?.id) return false;
    let cur: Habit | undefined = h;
    const seen = new Set<number>();
    while (cur?.stack_after != null && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.stack_after === habit?.id) return false;
      cur = habits.find((x) => x.id === cur!.stack_after);
    }
    return true;
  });
  const validAnchor = stackAfter != null && anchors.some((a) => a.id === stackAfter) ? stackAfter : null;

  const canSave = name.trim().length > 0 && (ftype !== 'specific_days' || days.length > 0);

  async function save() {
    if (!canSave) return;
    let frequency: Frequency;
    switch (ftype) {
      case 'weekly_count':
        frequency = { type: ftype, count };
        break;
      case 'specific_days':
        frequency = { type: ftype, days: [...days].sort() };
        break;
      case 'every_n_days':
        frequency = { type: ftype, n };
        break;
      default:
        frequency = { type: 'daily' };
    }
    const input: HabitInput = {
      name: name.trim(),
      section,
      frequency,
      why: why.trim() || null,
      minimum_version: minimum.trim() || null,
      stack_after: validAnchor,
    };
    if (habit) await editHabit(habit.id, input);
    else await addHabit(input);
    onClose();
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.bar}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.barBtn}>Cancel</Text>
        </Pressable>
        <Text style={styles.barTitle}>{habit ? 'Edit habit' : 'New habit'}</Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
          <Text style={[styles.barBtn, styles.barSave, !canSave && { opacity: 0.35 }]}>Save</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Label>Name</Label>
        <Input value={name} onChangeText={setName} placeholder="e.g. Stretch" autoFocus={!habit} returnKeyType="done" />

        <Label>Section</Label>
        <Segmented<Section>
          value={section}
          onChange={setSection}
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'evening', label: 'Evening' },
            { value: 'week', label: 'This week' },
          ]}
        />

        <Label>Frequency</Label>
        <Segmented<FrequencyType>
          value={ftype}
          onChange={setFtype}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly_count', label: 'Per week' },
            { value: 'specific_days', label: 'Days' },
            { value: 'every_n_days', label: 'Every N' },
          ]}
        />
        <View style={styles.freqDetail}>
          {ftype === 'daily' && <Text style={styles.help}>Every day.</Text>}
          {ftype === 'weekly_count' && (
            <>
              <Stepper value={count} min={1} max={7} onChange={setCount} suffix="× / week" />
              <Text style={styles.help}>Any days you like. Shows “x/{count} this week”.</Text>
            </>
          )}
          {ftype === 'specific_days' && (
            <>
              <View style={styles.chips}>
                {MON_FIRST.map((d) => (
                  <Chip
                    key={d}
                    label={WEEKDAY_NAMES[d]}
                    active={days.includes(d)}
                    onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
                  />
                ))}
              </View>
              <Text style={styles.help}>Only appears on these days.</Text>
            </>
          )}
          {ftype === 'every_n_days' && (
            <>
              <Stepper value={n} min={2} max={30} onChange={setN} suffix="days" />
              <Text style={styles.help}>Shows “due” / “overdue”, counted from the last time you did it.</Text>
            </>
          )}
        </View>

        <Label hint="optional">Why</Label>
        <Input value={why} onChangeText={setWhy} placeholder="What this does for you" multiline />

        <Label hint="optional">Minimum version</Label>
        <Input value={minimum} onChangeText={setMinimum} placeholder="The smallest version that still counts" />

        <Label hint="optional">Stack after</Label>
        {anchors.length === 0 ? (
          <Text style={styles.help}>Add another habit to this section to stack this one after it.</Text>
        ) : (
          <View style={styles.chips}>
            <Chip label="None" active={validAnchor == null} onPress={() => setStackAfter(null)} />
            {anchors.map((a) => (
              <Chip key={a.id} label={a.name} active={validAnchor === a.id} onPress={() => setStackAfter(a.id)} />
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.faint,
  },
  barTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  barBtn: { fontSize: 16, color: colors.accent },
  barSave: { fontWeight: '600' },
  content: { padding: 16, paddingBottom: 60 },
  freqDetail: { marginTop: 12, gap: 8 },
  help: { fontSize: 13, color: colors.sub },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
