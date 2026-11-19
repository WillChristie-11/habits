import React, { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { DayState, Habit, Section } from '../types';
import { useStore } from '../store';
import { layoutDay, stateOn, todayCompletion, visibleToday } from '../lib/schedule';
import { ProgressRing } from '../components/ProgressRing';
import { SectionBlock } from '../components/SectionBlock';
import { TimelineBlock } from '../components/TimelineBlock';
import { FeelingPicker } from '../components/FeelingPicker';
import { HabitForm } from './HabitForm';
import { HabitDetail } from './HabitDetail';
import { useThemedStyles, type Theme } from '../theme';

const SECTIONS: Section[] = ['morning', 'evening', 'week'];

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, now, settings, mark, unmark, rateFeeling, removeHabit } = useStore();
  const [editMode, setEditMode] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [form, setForm] = useState<{ habit: Habit | null } | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);
  const [feeling, setFeeling] = useState<{ habit: Habit; date: string } | null>(null);

  const ring = todayCompletion(habits, idx, ctx);
  const layout = useMemo(
    () => layoutDay(habits, editMode ? () => true : (h) => visibleToday(h, idx, ctx)),
    [habits, editMode, idx, ctx],
  );

  const onToggle = useCallback(
    async (h: Habit, state: DayState) => {
      if (state === 'done' || state === 'skipped') {
        Haptics.selectionAsync().catch(() => {});
        if (feeling?.habit.id === h.id) setFeeling(null);
        await unmark(h.id);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await mark(h.id, 'done');
        // Anchors are just dismissed: no feeling score.
        if (h.kind === 'habit') setFeeling({ habit: h, date: ctx.today });
      }
    },
    [mark, unmark, feeling, ctx.today],
  );

  const onOpen = useCallback((h: Habit) => {
    if (h.kind === 'anchor') setForm({ habit: h });
    else setDetail(h);
  }, []);

  const onDelete = useCallback(
    (h: Habit) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      removeHabit(h.id);
    },
    [removeHabit],
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
  const rowHandlers = { editMode, onToggle, onOpen, onLongPress, onDelete };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <View style={s.dateRow}>
            <Text style={s.date}>{dateLine}</Text>
            <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Settings">
              <Text style={s.gear}>⚙︎</Text>
            </Pressable>
          </View>
          <Text style={s.title}>Today</Text>
          <View style={s.actions}>
            {habits.length > 0 && (
              <Pressable onPress={() => setEditMode((e) => !e)} hitSlop={8}>
                <Text style={[s.action, editMode && { fontWeight: '600' }]}>{editMode ? 'Done' : 'Edit'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setForm({ habit: null })} hitSlop={8}>
              <Text style={s.action}>＋ Add</Text>
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
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Start small.</Text>
            <Text style={s.emptyText}>
              Add an anchor or two (Wake up, Work), then one habit for the morning and one for the evening.
            </Text>
            <Pressable style={s.emptyBtn} onPress={() => setForm({ habit: null })}>
              <Text style={s.emptyBtnText}>Add something</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TimelineBlock rows={layout.timeline} {...rowHandlers} />
            {SECTIONS.map((sec) => (
              <SectionBlock
                key={sec}
                section={sec}
                rows={layout.sections[sec]}
                setScrollEnabled={setScrollEnabled}
                {...rowHandlers}
              />
            ))}
          </>
        )}
        {editMode && <Text style={s.editHint}>Drag ≡ to reorder. Tap ✕ to remove.</Text>}
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    date: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
    gear: { fontSize: 16, color: t.textMuted },
    title: { fontSize: 32, fontWeight: '700', color: t.text, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 18, marginTop: 6 },
    action: { fontSize: 15, color: t.accent },
    empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
    emptyTitle: { fontSize: 22, fontWeight: '600', color: t.text },
    emptyText: { fontSize: 15, color: t.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    emptyBtn: { marginTop: 20, backgroundColor: t.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
    emptyBtnText: { color: t.onAccent, fontWeight: '600', fontSize: 16 },
    editHint: { textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 16 },
  });
