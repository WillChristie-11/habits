import React, { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { DayState, Habit, Section } from '../types';
import { useStore } from '../store';
import { stateOn, todayCompletion } from '../lib/schedule';
import { ProgressRing } from '../components/ProgressRing';
import { SectionBlock } from '../components/SectionBlock';
import { FeelingPicker } from '../components/FeelingPicker';
import { HabitForm } from './HabitForm';
import { HabitDetail } from './HabitDetail';
import { colors } from '../theme';

const SECTIONS: Section[] = ['morning', 'evening', 'week'];

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { habits, idx, ctx, now, settings, mark, unmark, rateFeeling } = useStore();
  const [editMode, setEditMode] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [form, setForm] = useState<{ habit: Habit | null } | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);
  const [feeling, setFeeling] = useState<{ habit: Habit; date: string } | null>(null);

  const ring = todayCompletion(habits, idx, ctx);

  const onToggle = useCallback(
    async (h: Habit, state: DayState) => {
      if (state === 'done' || state === 'skipped') {
        Haptics.selectionAsync().catch(() => {});
        if (feeling?.habit.id === h.id) setFeeling(null);
        await unmark(h.id);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await mark(h.id, 'done');
        setFeeling({ habit: h, date: ctx.today });
      }
    },
    [mark, unmark, feeling, ctx.today],
  );

  const onLongPress = useCallback(
    (h: Habit) => {
      const state = stateOn(h, idx, ctx.today, ctx);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const skipped = state === 'skipped';
      const action = skipped ? 'Undo skip' : 'Skip today (rest day)';
      const run = () => (skipped ? unmark(h.id) : mark(h.id, 'skipped'));
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { title: h.name, options: [action, 'Details', 'Cancel'], cancelButtonIndex: 2 },
          (i) => {
            if (i === 0) run();
            if (i === 1) setDetail(h);
          },
        );
      } else {
        Alert.alert(h.name, undefined, [
          { text: action, onPress: run },
          { text: 'Details', onPress: () => setDetail(h) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    },
    [idx, ctx, mark, unmark],
  );

  const dismissFeeling = useCallback(() => setFeeling(null), []);

  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{dateLine}</Text>
          <Text style={styles.title}>Today</Text>
          <View style={styles.actions}>
            {habits.length > 0 && (
              <Pressable onPress={() => setEditMode((e) => !e)} hitSlop={8}>
                <Text style={[styles.action, editMode && { fontWeight: '600' }]}>{editMode ? 'Done' : 'Edit'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setForm({ habit: null })} hitSlop={8}>
              <Text style={styles.action}>＋ Add</Text>
            </Pressable>
          </View>
        </View>
        {ring.total > 0 && <ProgressRing done={ring.done} total={ring.total} />}
      </View>

      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {habits.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Start small.</Text>
            <Text style={styles.emptyText}>Add one habit for the morning and one for the evening.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => setForm({ habit: null })}>
              <Text style={styles.emptyBtnText}>Add a habit</Text>
            </Pressable>
          </View>
        ) : (
          SECTIONS.map((s) => (
            <SectionBlock
              key={s}
              section={s}
              editMode={editMode}
              setScrollEnabled={setScrollEnabled}
              onToggle={onToggle}
              onOpen={setDetail}
              onLongPress={onLongPress}
            />
          ))
        )}
        {editMode && <Text style={styles.editHint}>Drag ≡ to reorder. Tap ✕ to remove.</Text>}
      </ScrollView>

      {feeling && (
        <FeelingPicker
          key={feeling.habit.id + feeling.date}
          habitName={feeling.habit.name}
          autoDismiss={settings.feelingAutoDismiss}
          onDismiss={dismissFeeling}
          onPick={(f) => {
            rateFeeling(feeling.habit.id, f, feeling.date);
            setFeeling(null);
          }}
        />
      )}

      <HabitForm visible={!!form} habit={form?.habit ?? null} onClose={() => setForm(null)} />
      <HabitDetail
        habit={detail}
        onClose={() => setDetail(null)}
        onEdit={(h) => {
          setDetail(null);
          // Let the sheet finish closing before presenting another.
          setTimeout(() => setForm({ habit: h }), 350);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  date: { fontSize: 13, color: colors.sub, fontWeight: '500' },
  title: { fontSize: 32, fontWeight: '700', color: colors.text, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 6 },
  action: { fontSize: 15, color: colors.accent },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 15, color: colors.sub, textAlign: 'center', marginTop: 8 },
  emptyBtn: { marginTop: 20, backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  editHint: { textAlign: 'center', color: colors.sub, fontSize: 13, marginTop: 16 },
});
