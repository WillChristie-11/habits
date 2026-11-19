import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { Section } from '../types';
import { useStore } from '../store';
import { dayCompletion, layoutDay, visibleOn } from '../lib/schedule';
import { fromKey } from '../lib/dates';
import { ProgressRing } from '../components/ProgressRing';
import { SectionBlock } from '../components/SectionBlock';
import { Banners } from '../components/Banners';
import { WeekStrip } from '../components/WeekStrip';
import { useHabitActions } from '../components/useHabitActions';
import { useThemedStyles, type Theme } from '../theme';

const SECTIONS: Section[] = ['morning', 'evening', 'week'];

/** Habits for one day (today by default), with the week strip on top. Anchors live on Schedule. */
export function TodayScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  // Follow "today" across midnight unless a past day is being viewed.
  const date = picked && picked < ctx.today ? picked : ctx.today;
  const isToday = date === ctx.today;
  const [editMode, setEditMode] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const actions = useHabitActions(date);

  const tracked = useMemo(() => habits.filter((h) => h.kind === 'habit'), [habits]);
  const ring = dayCompletion(habits, idx, ctx, date);
  const layout = useMemo(
    () => layoutDay(tracked, editMode ? () => true : (h) => visibleOn(h, idx, ctx, date), { timeline: false }),
    [tracked, editMode, idx, ctx, date],
  );
  const hasRows = SECTIONS.some((sec) => layout.sections[sec].length > 0);

  const title = isToday
    ? 'Today'
    : fromKey(date).toLocaleDateString(undefined, { weekday: 'long' });
  const dateLine = fromKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

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
          <Text style={s.title}>{title}</Text>
          <View style={s.actions}>
            {!isToday && (
              <Pressable onPress={() => setPicked(null)} hitSlop={8}>
                <Text style={[s.action, { fontWeight: '600' }]}>← Back to today</Text>
              </Pressable>
            )}
            {isToday && tracked.length > 0 && (
              <Pressable onPress={() => setEditMode((e) => !e)} hitSlop={8}>
                <Text style={[s.action, editMode && { fontWeight: '600' }]}>{editMode ? 'Done' : 'Edit'}</Text>
              </Pressable>
            )}
            {isToday && (
              <Pressable onPress={() => actions.openForm(null)} hitSlop={8}>
                <Text style={s.action}>＋ Add</Text>
              </Pressable>
            )}
          </View>
        </View>
        {ring.total > 0 && <ProgressRing done={ring.done} total={ring.total} />}
      </View>

      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {isToday && <Banners />}
        {tracked.length > 0 && <WeekStrip selected={date} onSelect={(d) => setPicked(d === ctx.today ? null : d)} />}
        {!isToday && (
          <Text style={s.pastHint}>Editing {dateLine}. Tap a circle to mark it done, long-press for a rest day.</Text>
        )}

        {tracked.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Start small.</Text>
            <Text style={s.emptyText}>Add one habit for the morning and one for the evening.</Text>
            <Pressable style={s.emptyBtn} onPress={() => actions.openForm(null)}>
              <Text style={s.emptyBtnText}>Add a habit</Text>
            </Pressable>
          </View>
        ) : !hasRows && !editMode ? (
          <Text style={s.none}>Nothing due this day.</Text>
        ) : (
          SECTIONS.map((sec) => (
            <SectionBlock
              key={sec}
              section={sec}
              rows={layout.sections[sec]}
              date={date}
              editMode={editMode && isToday}
              setScrollEnabled={setScrollEnabled}
              onToggle={actions.onToggle}
              onOpen={actions.onOpen}
              onLongPress={actions.onLongPress}
              onDelete={actions.onDelete}
            />
          ))
        )}
        {editMode && <Text style={s.editHint}>Drag ≡ to reorder. Tap ✕ to remove.</Text>}
      </ScrollView>

      {actions.overlays}
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
    actions: { flexDirection: 'row', gap: 18, marginTop: 6, minHeight: 20 },
    action: { fontSize: 15, color: t.accent },
    pastHint: { fontSize: 13, color: t.textMuted, marginTop: 12, marginHorizontal: 4, lineHeight: 18 },
    none: { fontSize: 15, color: t.textMuted, marginTop: 24, textAlign: 'center' },
    empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
    emptyTitle: { fontSize: 22, fontWeight: '600', color: t.text },
    emptyText: { fontSize: 15, color: t.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    emptyBtn: { marginTop: 20, backgroundColor: t.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
    emptyBtnText: { color: t.onAccent, fontWeight: '600', fontSize: 16 },
    editHint: { textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 16 },
  });
